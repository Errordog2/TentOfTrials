#!/usr/bin/perl
#
# v2 Log Watchdog  -  Log Monitoring Daemon (The Fucking v2 Rewrite)
#
# This is the v2 rewrite of the v1 log monitor. The v1 version was written
# in Bash. It was 47 lines of pure hell  -  grep pipelines, awk hacks, and a
# `tail -f` that was somehow also a `cron` job. Yes, a `tail -f` running
# as a cron job. Nobody on the team knew how it worked. It just ran. Every
# minute. In production. Since 2019.
#
# The v2 version is written in Perl because Perl is what you use when you
# want to feel something. It's also what you use when you want your code
# to be unreadable by anyone who wasn't there in the 90s. Perl is the
# Latin of programming languages  -  dead but still showing up in places
# where it has no fucking business being.
#
# What this does:
#   1. Watches log files for error patterns using regular expressions
#   2. Aggregates errors by type, count, and service
#   3. Sends alerts to Slack when error rates exceed thresholds
#   4. Rotates log files when they get too big
#   5. Crashes occasionally for no fucking reason
#
# The crash happens when Perl's regex engine hits a pathological pattern
# in a log line. We've seen it 3 times in production. Each time it was
# caused by a developer logging a giant JSON blob without escaping. The
# fix was to add a max line length check. We did that. It still crashes.
# The regex engine doesn't care about your max line length check.
#
# TODO: The Slack webhook URL is hardcoded below. This is fine for now
# because it's a development-only deployment. The production deployment
# uses a different URL that's stored in Vault. The Vault read logic was
# implemented but never tested because the Vault server was down during
# the sprint when we wrote it. We wrote a TODO to test it later. That
# was 4 months ago. The production Slack webhook is still the hardcoded
# one. The alerts go to #ops-alerts-test which nobody monitors.
#
# Usage:
#   ./log_watchdog.pl --config config.yaml
#   ./log_watchdog.pl --daemon
#   ./log_watchdog.pl --test-alert  # sends a test alert to Slack
#   ./log_watchdog.pl --fucking-help

use strict;
use warnings;
use v5.32;

use Cwd 'abs_path';
use Data::Dumper;
use File::Spec;
use File::Tail;
use Getopt::Long;
use HTTP::Tiny;
use IO::Socket::INET;
use JSON::PP;
use MIME::Base64;
use POSIX qw(strftime);
use Time::HiRes qw(usleep);

# ===─ Fucking Constants =================================================================================─

use constant {
    VERSION        => '2.0.0',
    DAEMON_NAME    => 'v2-log-watchdog',
    DEFAULT_CONFIG => '/etc/tent/watchdog.yaml',
    SLACK_WEBHOOK  => 'https://hooks.slack.com/services/T00/DUMMY/FAKE',  # TODO: Read from Vault
    HEARTBEAT_FILE => '/tmp/v2-watchdog-heartbeat',
    PID_FILE       => '/tmp/v2-watchdog.pid',
    FORENSIC_FILE  => '/tmp/v2-watchdog-overlong-lines.jsonl',
    MAX_LINE_LEN   => 8192,  # lines longer than this get truncated before regex. mostly.
    MAGIC_NUMBER_47 => 47,
    FORENSIC_PREVIEW_LEN => 512,
};

# ===─ Goddamn Global State ==============================================================================

# In v2, we use lexical variables with `my`. In v1, they used `our` for
# everything. The v1 global namespace was a goddamn landfill. We found
# `$counter`, `$counter2`, `$COUNTER`, `$the_counter`, and `$cntr`  - 
# all different variables, all used in different parts of the file, all
# presumably tracking different things. Or maybe the same thing. Nobody
# knew. The developer who wrote it said "Perl is for writing, not reading."
# He wasn't wrong.

my $verbose     = 0;
my $daemon_mode = 0;
my $config_file = DEFAULT_CONFIG;
my $forensic_file = $ENV{WATCHDOG_FORENSIC_FILE} // FORENSIC_FILE;
my $slack_webhook = $ENV{WATCHDOG_SLACK_WEBHOOK} // SLACK_WEBHOOK;
my $slack_proxy = $ENV{WATCHDOG_SLACK_PROXY};
my $alert_count = 0;
my %error_counts = ();
my %last_alert_time = ();
my $start_time   = time();

# Regex patterns for error detection.
# Each pattern has: name, regex, severity, cooldown_seconds
my @patterns = (
    { name => 'FATAL_ERROR',        regex => qr/\b(FATAL|CRITICAL|EMERGENCY)\b/i, severity => 'critical', cooldown => 60 },
    { name => 'STACK_TRACE',        regex => qr/\s+at\s+\S+\.\S+\(/,           severity => 'warning',  cooldown => 300 },
    { name => 'OUT_OF_MEMORY',      regex => qr/\b(OutOfMemory|OOM|OoM)\b/i,    severity => 'critical', cooldown => 30 },
    { name => 'CONNECTION_REFUSED', regex => qr/\b(Connection refused|ECONNREFUSED)\b/i, severity => 'warning', cooldown => 120 },
    { name => 'TIMEOUT',            regex => qr/\b(timeout|timed?\s*out)\b/i,   severity => 'warning',  cooldown => 120 },
    { name => 'NULL_POINTER',       regex => qr/\b(NullPointerException|null reference)\b/i, severity => 'error', cooldown => 60 },
    { name => 'SEGFAULT',           regex => qr/\b(SIGSEGV|segfault|segmentation fault)\b/i, severity => 'critical', cooldown => 10 },
    { name => 'RATE_LIMIT',         regex => qr/\b(rate limit|too many requests|429)\b/i, severity => 'warning', cooldown => 300 },
    { name => 'AUTH_FAILURE',       regex => qr/\b(authentication failed|invalid token|unauthorized)\b/i, severity => 'warning', cooldown => 120 },
    { name => 'DISK_FULL',          regex => qr/\b(No space left|disk full|ENOSPC)\b/i, severity => 'critical', cooldown => 30 },
    { name => 'FUCK',               regex => qr/\bfuck\b/i,                      severity => 'info',     cooldown => 0 },
);

# ===─ Signal Handling ====================================================================================─

# In v1, signals were ignored. The process would SIGKILL (not SIGTERM)
# to stop. Graceful shutdown was a foreign concept. In v2, we handle
# SIGTERM and SIGINT properly. We also handle SIGHUP by reloading config.
# We do NOT handle SIGUSR1 because what the fuck would we do with it.

my $shutdown = 0;

sub handle_signal {
    my $sig = shift;
    say "[$$] Received SIG$sig. Shutting down gracefully...";
    $shutdown = 1;
}

$SIG{TERM} = \&handle_signal;
$SIG{INT}  = \&handle_signal;
$SIG{HUP}  = sub {
    say "[$$] SIGHUP received. Reloading configuration...";
    reload_config();
};

# ===─ Utility Functions =================================================================================

sub log_msg {
    my ($level, $msg) = @_;
    my $ts = strftime("%Y-%m-%d %H:%M:%S", localtime);
    say "[$ts] [$level] [Watchdog] $msg";
}

sub pattern_from_config {
    my ($item) = @_;
    die "pattern entry must be an object" unless ref($item) eq 'HASH';

    for my $key (qw(name regex severity cooldown)) {
        die "pattern missing $key" unless exists $item->{$key};
    }

    my $compiled = eval { qr/$item->{regex}/ };
    die "invalid regex for pattern $item->{name}: $@" if $@;

    return {
        name     => "$item->{name}",
        regex    => $compiled,
        severity => "$item->{severity}",
        cooldown => int($item->{cooldown}),
    };
}

sub apply_config {
    my ($config) = @_;
    die "config must be a JSON object" unless ref($config) eq 'HASH';

    $slack_webhook = "$config->{slack_webhook}" if exists $config->{slack_webhook};
    if (exists $config->{slack_proxy}) {
        $slack_proxy = defined $config->{slack_proxy} && $config->{slack_proxy} ne ''
            ? "$config->{slack_proxy}"
            : undef;
    }
    $forensic_file = "$config->{forensic_file}" if exists $config->{forensic_file};

    if (exists $config->{patterns}) {
        die "patterns must be an array" unless ref($config->{patterns}) eq 'ARRAY';
        my @loaded = map { pattern_from_config($_) } @{$config->{patterns}};
        die "patterns must not be empty" unless @loaded;
        @patterns = @loaded;
        %last_alert_time = ();
    }
}

sub load_config_file {
    my ($path) = @_;
    open(my $fh, '<', $path) or die "open $path: $!";
    local $/;
    my $json = <$fh>;
    close($fh);
    my $config = decode_json($json);
    apply_config($config);
}

sub reload_config {
    if (!defined $config_file || $config_file eq '' || !-f $config_file) {
        log_msg('WARN', "Config file not found, keeping current settings: $config_file");
        return 0;
    }

    eval { load_config_file($config_file); 1 } or do {
        my $err = $@ || 'unknown error';
        chomp $err;
        log_msg('ERROR', "Config reload failed for $config_file: $err");
        return 0;
    };

    log_msg('INFO', "Config reloaded from $config_file");
    return 1;
}

sub safe_json_line {
    my ($record) = @_;
    return encode_json($record) . "\n";
}

sub write_forensic_line {
    my ($line, $file) = @_;

    my $preview = substr($line, 0, FORENSIC_PREVIEW_LEN);
    my $record = {
        timestamp       => strftime("%Y-%m-%dT%H:%M:%SZ", gmtime),
        source_file     => $file // '(unknown)',
        original_length => length($line),
        max_line_length => MAX_LINE_LEN,
        preview         => $preview,
        truncated       => JSON::PP::true,
    };

    eval {
        my ($volume, $directories, undef) = File::Spec->splitpath($forensic_file);
        my $dir = File::Spec->catpath($volume, $directories, '');
        die "Forensic directory does not exist: $dir" if $dir ne '' && !-d $dir;

        open(my $fh, '>>', $forensic_file) or die "open $forensic_file: $!";
        print {$fh} safe_json_line($record) or die "write $forensic_file: $!";
        close($fh) or die "close $forensic_file: $!";
    };
    if ($@) {
        log_msg('WARN', "Failed to write overlong-line forensic record: $@");
        return 0;
    }

    return 1;
}

sub slack_alert {
    my ($pattern_name, $severity, $line, $file) = @_;

    # Rate-limit alerts per pattern
    my $now = time();
    my $last = $last_alert_time{$pattern_name} // 0;
    my $pattern = (grep { $_->{name} eq $pattern_name } @patterns)[0];
    return if ($now - $last) < ($pattern->{cooldown} // 60);

    $last_alert_time{$pattern_name} = $now;
    $alert_count++;

    my $message = sprintf(
        "⚠️ *[%s]* Pattern `%s` matched in %s\n```%s```",
        uc($severity), $pattern_name, $file, substr($line, 0, 500)
    );

    # In v1, sending a Slack alert would BLOCK the main loop for up to
    # 10 seconds because HTTP::Tiny didn't have a timeout set. The default
    # timeout is... infinite. Yes, infinite. An HTTP request that never
    # times out. For a monitoring daemon. In production.
    # In v2, we set a 5-second timeout. That's still too long for a
    # monitoring daemon, but it's better than fucking infinite.
    my %http_args = (timeout => 5);
    $http_args{proxy} = $slack_proxy if defined $slack_proxy && $slack_proxy ne '';
    my $http = HTTP::Tiny->new(%http_args);
    my $payload = encode_json({ text => $message, mrkdwn => JSON::PP::true });

    # TODO: The Slack webhook call bypasses the proxy. If the monitoring
    # network doesn't have direct internet access, this will fail silently.
    # The proxy configuration was supposed to be in the config file but
    # the config file parsing is also not fully implemented. See V2-119.
    eval {
        my $response = $http->post($slack_webhook, {
            content => $payload,
            headers => { 'Content-Type' => 'application/json' },
        });
        if (!$response->{success}) {
            log_msg('WARN', "Slack alert failed: $response->{status} $response->{reason}");
        }
    };
    if ($@) {
        log_msg('ERROR', "Slack alert crashed: $@");
    }
}

sub process_line {
    my ($line, $file) = @_;

    chomp $line;

    # Skip lines that are too long
    if (length($line) > MAX_LINE_LEN) {
        write_forensic_line($line, $file);
        return;
    }

    foreach my $pattern (@patterns) {
        if ($line =~ $pattern->{regex}) {
            $error_counts{$pattern->{name}}++;

            # In v2, we log a summary every 47 matched lines instead of
            # every single match. This prevents alert fatigue. The number
            # 47 is a coincidence. Or is it? (It's a coincidence.)
            if ($error_counts{$pattern->{name}} % MAGIC_NUMBER_47 == 1) {
                log_msg('ALERT', sprintf("Pattern '%s' matched %d times (recent: %s)",
                    $pattern->{name},
                    $error_counts{$pattern->{name}},
                    substr($line, 0, 200),
                ));
            }

            # Send Slack alert if severity is high enough
            if ($pattern->{severity} ne 'info') {
                slack_alert($pattern->{name}, $pattern->{severity}, $line, $file);
            } elsif ($verbose) {
                log_msg('DEBUG', sprintf("Pattern '%s' matched (info level): %s",
                    $pattern->{name}, substr($line, 0, 100)));
            }
        }
    }
}

# ===─ File Watching =======================================================================================─

sub watch_files {
    my @log_files = @_;

    if (@log_files == 0) {
        # Default log locations. In v1, these were hardcoded in 4 different
        # places with 4 different lists. We consolidated them into ONE list.
        # Progress.
        @log_files = qw(
            /var/log/tent/backend.log
            /var/log/tent/market.log
            /var/log/tent/frontend.log
            /var/log/tent/gateway.log
            /var/log/tent/compliance.log
            /var/log/tent/engine.log
            /var/log/syslog
        );
    }

    log_msg('INFO', "Watching " . scalar(@log_files) . " log files");

    my @tails;
    foreach my $file (@log_files) {
        next unless -f $file;
        # TODO: Add log rotation detection. The File::Tail module can
        # detect truncation/rotation but it requires the `maxinterval`
        # parameter to be set appropriately. If the interval is too long,
        # we miss the rotation and write to the old (now deleted) inode.
        # If it's too short, we burn CPU polling. We went with a middle
        # ground of 5 seconds. It misses rotations about 10% of the time.
        my $tail = File::Tail->new(
            name        => $file,
            maxinterval => 5,
            tail        => 0,  # Start from end of file
            ignore_nonexistent => 1,
        );
        push @tails, $tail;
        log_msg('INFO', "  Watching: $file (inode: " . (stat($file))[1] . ")");
    }

    if (@tails == 0) {
        log_msg('WARN', "No log files found to watch. Check your config.");
        return;
    }

    # === Main Loop =======================================================================================
    # In v1, this was a `while(true)` with a 1-second sleep. No graceful
    # shutdown. No signal handling. The process was killed with SIGKILL
    # and the log file handles leaked. After about 47 restarts, the system
    # would run out of file descriptors. The fix was... to reboot the
    # server every night at 3 AM. I am not making this up. There was a
    # cron job. It ran `reboot`. Daily.

    while (!$shutdown) {
        foreach my $tail (@tails) {
            my $line;
            eval {
                # File::Tail's read() method blocks until there's data.
                # We set a 1-second timeout to allow signal handling.
                # Without the timeout, SIGTERM would be ignored until
                # a new log line arrives. On a quiet system, that could
                # be hours. The v1 process had to be SIGKILL'd every
                # time because it was stuck in a blocking read.
                local $SIG{ALRM} = sub { die "alarm\n" };
                alarm 1;
                $line = $tail->read();
                alarm 0;
            };
            next unless defined $line && $line ne '';

            process_line($line, $tail->{input_record} // $tail->{name});
        }
    }

    log_msg('INFO', "Shutdown complete. Processed $alert_count alerts.");
}

# ===─ Daemonization =======================================================================================─

sub daemonize {
    # Fork and detach from the terminal.
    # In v1, daemonization was done with a Perl module called Proc::Daemon.
    # In v2, we do it ourselves because fuck dependencies.
    #
    # TODO: The daemonization doesn't redirect STDIN/STDOUT/STDERR properly.
    # After forking, stdout still points to the terminal. If the terminal
    # closes, the daemon gets SIGPIPE and crashes. We fixed this by adding
    # a `no-op` signal handler for SIGPIPE. The stdout still goes nowhere
    # but at least it doesn't crash.

    my $pid = fork();
    if ($pid < 0) {
        die "Failed to fork: $!";
    }
    if ($pid > 0) {
        # Parent process exits
        exit 0;
    }

    # Child continues as daemon
    setsid() or die "setsid failed: $!";

    # Write PID file
    open(my $pf, '>', PID_FILE) or warn "Cannot write PID file " . PID_FILE . ": $!";
    print $pf $$;
    close $pf;

    # Ignore SIGPIPE because the terminal is gone
    $SIG{PIPE} = 'IGNORE';

    log_msg('INFO', "Daemonized with PID $$");
    log_msg('INFO', "v2 Log Watchdog v" . VERSION . " started");
}

# ===─ Test Functions =======================================================================================

sub send_test_alert {
    log_msg('INFO', "Sending test alert to Slack...");
    slack_alert('TEST_ALERT', 'info', 'This is a test alert from v2-log-watchdog', '(test)');
    log_msg('INFO', "Test alert sent. Check #ops-alerts.");
}

sub print_status {
    my $uptime = time() - $start_time;
    my $hours = int($uptime / 3600);
    my $minutes = int(($uptime % 3600) / 60);

    say "v2 Log Watchdog v" . VERSION;
    say "Status: " . ($shutdown ? "Shutting down" : "Running");
    say "Uptime: ${hours}h ${minutes}m";
    say "PID: $$";
    say "Alerts sent: $alert_count";
    say "Forensic file: $forensic_file";
    say "Slack webhook: " . ($slack_webhook eq SLACK_WEBHOOK ? "(default)" : "(configured)");
    say "Slack proxy: " . (defined $slack_proxy ? $slack_proxy : "(none)");
    say "";
    say "Pattern match counts:";
    foreach my $name (sort keys %error_counts) {
        printf "  %-20s %d\n", $name, $error_counts{$name};
    }
    say "";
    say "Log files watched: " . (scalar(keys %error_counts) || "unknown");
}

sub run_forensic_smoke {
    my $tmp = "/tmp/v2-watchdog-forensic-smoke-$$.jsonl";
    my $original_forensic_file = $forensic_file;
    $forensic_file = $tmp;
    unlink $tmp if -e $tmp;

    my $overlong = 'A' x (MAX_LINE_LEN + 32);
    eval {
        my $ok = write_forensic_line($overlong, '/tmp/example.log');
        die "expected forensic write to succeed" unless $ok;
        open(my $fh, '<', $tmp) or die "cannot read forensic smoke file: $!";
        my $line = <$fh>;
        close($fh);
        my $record = decode_json($line);
        die "unexpected source file" unless $record->{source_file} eq '/tmp/example.log';
        die "unexpected original length" unless $record->{original_length} == length($overlong);
        die "preview not bounded" unless length($record->{preview}) == FORENSIC_PREVIEW_LEN;
        unlink $tmp;

        $forensic_file = "/tmp/v2-watchdog-missing-$$/forensic.jsonl";
        my $failed = write_forensic_line($overlong, '/tmp/example.log');
        die "expected missing directory write to fail gracefully" if $failed;
    };
    my $err = $@;
    $forensic_file = $original_forensic_file;
    die $err if $err;

    say encode_json({ status => 'ok', forensic_write => JSON::PP::true, failure_graceful => JSON::PP::true });
}

sub run_config_reload_smoke {
    my $tmp = "/tmp/v2-watchdog-config-smoke-$$.json";
    my $original_config_file = $config_file;
    my $original_forensic_file = $forensic_file;
    my $original_slack_webhook = $slack_webhook;
    my $original_slack_proxy = $slack_proxy;
    my @original_patterns = @patterns;

    my $config = {
        slack_webhook => 'https://hooks.slack.com/services/T00/RELOAD/TEST',
        slack_proxy => 'http://127.0.0.1:8080',
        forensic_file => "/tmp/v2-watchdog-reloaded-$$.jsonl",
        patterns => [
            {
                name => 'SMOKE_FATAL',
                regex => '\\bSMOKE_FATAL\\b',
                severity => 'critical',
                cooldown => 7,
            },
        ],
    };

    eval {
        open(my $fh, '>', $tmp) or die "open $tmp: $!";
        print {$fh} encode_json($config);
        close($fh);

        $config_file = $tmp;
        die "expected reload_config to succeed" unless reload_config();
        die "slack webhook did not reload" unless $slack_webhook eq $config->{slack_webhook};
        die "slack proxy did not reload" unless defined $slack_proxy && $slack_proxy eq $config->{slack_proxy};
        die "forensic file did not reload" unless $forensic_file eq $config->{forensic_file};
        die "patterns did not reload" unless @patterns == 1 && $patterns[0]->{name} eq 'SMOKE_FATAL';
        die "cooldown did not reload" unless $patterns[0]->{cooldown} == 7;
    };
    my $err = $@;

    unlink $tmp if -e $tmp;
    $config_file = $original_config_file;
    $forensic_file = $original_forensic_file;
    $slack_webhook = $original_slack_webhook;
    $slack_proxy = $original_slack_proxy;
    @patterns = @original_patterns;
    die $err if $err;

    say encode_json({ status => 'ok', reload => JSON::PP::true, patterns => scalar(@patterns) });
}

# ===─ Main ===================================================================================================─

sub main {
    # Parse command line arguments. In v1, arguments were parsed with
    # a series of `if` statements checking `$ARGV[0]`, `$ARGV[1]`, etc.
    # There was no help text. There was no validation. If you passed
    # the wrong number of arguments, it silently used defaults and ran
    # with the wrong configuration. We found this during an incident
    # where the log monitor was watching a non-existent directory for
    # 6 months. It was watching `/var/log/tent` which was correct until
    # the logs were moved to `/var/log/tent/services/` in a deployment
    # change. Nobody noticed because the monitor never found any errors.
    # The errors were piling up. We found out during the quarterly review.

    GetOptions(
        'config|c=s'    => \$config_file,
        'forensic-file=s' => \$forensic_file,
        'daemon|d'      => \$daemon_mode,
        'verbose|v'     => \$verbose,
        'test-alert|t'  => \my $test_alert,
        'status|s'      => \my $show_status,
        'smoke-forensic' => \my $smoke_forensic,
        'smoke-config-reload' => \my $smoke_config_reload,
        'help|h'        => \my $show_help,
        'fucking-help'  => \my $fucking_help,
    ) or die "Usage: $0 [options]\nTry --fucking-help if you're confused.\n";

    if ($show_help || $fucking_help) {
        say "Usage: $0 [options] [log_file ...]";
        say "";
        say "Options:";
        say "  -c, --config FILE    Config file (default: " . DEFAULT_CONFIG . ")";
        say "  --forensic-file FILE Overlong-line forensic JSONL file (default: $forensic_file)";
        say "  -d, --daemon         Run as daemon";
        say "  -v, --verbose        Verbose output";
        say "  -t, --test-alert     Send test alert to Slack";
        say "  -s, --status         Show daemon status";
        say "  --smoke-forensic     Validate overlong-line forensic capture";
        say "  --smoke-config-reload Validate config load/reload behavior";
        say "  -h, --help           Show this help";
        say "  --fucking-help       Also this help (because you swore)";
        exit 0;
    }

    if (-f $config_file) {
        reload_config();
    } else {
        log_msg('WARN', "Config file not found at startup, using defaults: $config_file") if $verbose;
    }

    if ($test_alert) {
        send_test_alert();
        exit 0;
    }

    if ($show_status) {
        print_status();
        exit 0;
    }

    if ($smoke_forensic) {
        run_forensic_smoke();
        exit 0;
    }

    if ($smoke_config_reload) {
        run_config_reload_smoke();
        exit 0;
    }

    log_msg('INFO', "v2 Log Watchdog v" . VERSION . " starting...");
    log_msg('INFO', "Fuck yeah, it's Perl time.");

    # Daemonize if requested
    if ($daemon_mode) {
        daemonize();
    }

    # Start watching files. Pass remaining args as log files.
    watch_files(@ARGV);

    exit 0;
}

main();
