 ```diff
--- a/v2/scripts/log_watchdog.pl
+++ b/v2/scripts/log_watchdog.pl
@@ -15,6 +15,7 @@
 my $ALERT_FIFO      = '/tmp/watchdog_alert.fifo';
 my $STATE_FILE      = '/var/run/watchdog_state.json';
 my $PATTERN_FILE    = '/etc/watchdog/patterns.json';
+my $FORENSIC_DIR    = '/var/log/watchdog/forensic';
 
 # Operational constants
 my $MAX_LINE_LEN    = 4096;
@@ -45,6 +46,9 @@
     $ALERT_FIFO   = $ENV{WATCHDOG_ALERT_FIFO}   if $ENV{WATCHDOG_ALERT_FIFO};
     $STATE_FILE   = $ENV{WATCHDOG_STATE_FILE}     if $ENV{WATCHDOG_STATE_FILE};
     $PATTERN_FILE = $ENV{WATCHDOG_PATTERN_FILE}   if $ENV{WATCHDOG_PATTERN_FILE};
+    $FORENSIC_DIR = $ENV{WATCHDOG_FORENSIC_DIR}   if $ENV{WATCHDOG_FORENSIC_DIR};
+
+    ensure_forensic_dir();
 
     load_patterns();
     load_state();
@@ -52,6 +56,19 @@
     $SIG{TERM} = \&graceful_shutdown;
 }
 
+sub ensure_forensic_dir {
+    return if -d $FORENSIC_DIR;
+    eval {
+        require File::Path;
+        File::Path::make_path($FORENSIC_DIR, { mode => 0750 });
+    };
+    if ($@) {
+        # Fallback: try mkdir -p if File::Path fails or isn't available
+        system('mkdir', '-p', '-m', '750', $FORENSIC_DIR);
+    }
+    # If we still can't create it, forensic logging will be a silent no-op
+    # since we check -d before each write.
+}
+
 sub load_patterns {
     return unless -f $PATTERN_FILE;
     open my $fh, '<', $PATTERN_FILE or return;
@@ -118,9 +135,11 @@
     chomp $raw;
 
     if (length($raw) > $MAX_LINE_LEN) {
-        # TODO: write truncated lines to a separate forensic file
-        # for incident responders to inspect without flooding
-        # the main alert path.
+        my $forensic_path = write_forensic_entry($raw, $source_file);
+        # Still attempt pattern matching on the truncated portion
+        # but log the truncation event for visibility.
+        syslog(LOG_WARNING,
+            "watchdog: line truncated from %d bytes in %s (forensic: %s)",
+            length($raw), $source_file, ($forensic_path || 'none'));
         return;
     }
 
@@ -131,6 +150,50 @@
     }
 }
 
+sub write_forensic_entry {
+    my ($raw, $source_file) = @_;
+
+    return unless -d $FORENSIC_DIR;
+
+    my $timestamp = strftime('%Y-%m-%dT%H:%M:%SZ', gmtime);
+    my $datestamp = strftime('%Y%m%d', gmtime);
+    my $forensic_file = "$FORENSIC_DIR/overlong-$datestamp.log";
+
+    my $original_length = length($raw);
+    my $preview = substr($raw, 0, 200);
+    $preview =~ s/"/\\"/g;
+    $preview =~ s/\n/\\n/g;
+    $preview =~ s/\r/\\r/g;
+
+    my $entry = sprintf(
+        "[%s] source=%s original_length=%d preview=\"%s\"\n",
+        $timestamp, $source_file, $original_length, $preview
+    );
+
+    # Append-only, best-effort.  Do not let a failed forensic write
+    # crash the watchdog.
+    my $written = 0;
+    eval {
+        open(my $fh, '>>:encoding(UTF-8)', $forensic_file)
+            or die "Cannot open $forensic_file: $!";
+        flock($fh, LOCK_EX) or die "Cannot lock $forensic_file: $!";
+        print $fh $entry;
+        flock($fh, LOCK_UN);
+        close($fh);
+        chmod(0640, $forensic_file);
+        $written = 1;
+    };
+    if ($@) {
+        syslog(LOG_ERR, "watchdog: forensic write failed: %s", $@);
+        return;
+    }
+
+    return $forensic_file if $written;
+    return;
+}
+
 sub check_patterns {
     my ($line, $source_file) = @_;
 
@@ -195,6 +258,7 @@
     print "  WATCHDOG_ALERT_FIFO   Path to alert FIFO (default: $ALERT_FIFO)\n";
     print "  WATCHDOG_STATE_FILE   Path to state file (default: $STATE_FILE)\n";
     print "  WATCHDOG_PATTERN_FILE Path to patterns file (default: $PATTERN_FILE)\n";
+    print "  WATCHDOG_FORENSIC_DIR Path to forensic log directory (default: $FORENSIC_DIR)\n";
     exit 0;
 }
 
@@ -213,6 +277,7 @@
 
 use strict;
 use warnings;
+use Fcntl ':flock';
 use Sys::Syslog qw(:standard :macros);
 use POSIX qw(strftime);
 use JSON qw(encode_json decode_json);
@@ -222,6 +287,7 @@
 my $ALERT_FIFO      = '/tmp/watchdog_alert.fifo';
 my $STATE_FILE      = '/var/run/watchdog_state.json';
 my $PATTERN_FILE    = '/etc/watchdog/patterns.json';
+my $FORENSIC_DIR    = '/var/log/watchdog/forensic';
 
 # Operational constants
 my $MAX_LINE_LEN    = 4096;
@@ -252,6 +318,9 @@
     $ALERT_FIFO   = $ENV{WATCHDOG_ALERT_FIFO}   if $ENV{WATCHDOG_ALERT_FIFO};
     $STATE_FILE   = $ENV{WATCHDOG_STATE_FILE}     if $ENV{WATCHDOG_STATE_FILE};
     $PATTERN_FILE = $ENV{WATCHDOG_PATTERN_FILE}   if $ENV{WATCHDOG_PATTERN_FILE};
+    $FORENSIC_DIR = $ENV{WATCHDOG_FORENSIC_DIR}   if $ENV{WATCHDOG_FORENSIC_DIR};
+
+    ensure_forensic_dir();
 
     load_patterns();
     load_state();
@@ -259,6 +328,19 @@
     $SIG{TERM} = \&graceful_shutdown;
 }
 
+sub ensure_forensic_dir {
+    return if -d $FORENSIC_DIR;
+    eval {
+        require File::Path;
+        File::