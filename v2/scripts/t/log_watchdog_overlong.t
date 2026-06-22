# Fix for Issue #6: [$50 BOUNTY] [Perl] Preserve overlong watchdog log lines for forensic review

--- /dev/null
+++ b/v2/scripts/t/log_watchdog_overlong.t
@@ -0,0 +1,67 @@
+#!/usr/bin/env perl
+# Smoke test for overlong log line forensic capture
+use strict;
+use warnings;
+use Test::More tests => 6;
+use File::Temp qw(tempfile);
+use FindBin qw($Bin);
+
+# Add script directory to path
+use lib "$Bin/..";
+require 'log_watchdog.pl';
+
+# Create temporary forensic file for testing
+my ($fh, $temp_forensic_file) = tempfile(UNLINK => 1);
+close($fh);
+
+# Configure to use temp file
+main::set_forensic_output_path($temp_forensic_file);
+
+# Store original MAX_LINE_LEN and set test value
+my $original_max = $main::MAX_LINE_LEN;
+$main::MAX_LINE_LEN = 100;
+
+# Test 1: Normal line should not write to forensic file
+my $normal_line = "This is a normal log line within limits";
+main::process_line($normal_line, "test_source.log");
+
+my $forensic_content = do {
+    local $/;
+    open my $rfh, '<', $temp_forensic_file or die "Cannot read forensic file: $!";
+    <$rfh>;
+} // '';
+
+ok(length($forensic_content) == 0, "Normal line does not write to forensic file");
+
+# Test 2: Overlong line should write to forensic file
+my $overlong_line = "X" x 200;
+main::process_line($overlong_line, "test_overlong.log");
+
+$forensic_content = do {
+    local $/;
+    open my $rfh, '<', $temp_forensic_file or die "Cannot read forensic file: $!";
+    <$rfh>;
+};
+
+ok(length($forensic_content) > 0, "Overlong line writes to forensic file");
+
+# Test 3: Verify forensic record contains timestamp pattern
+like($forensic_content, qr/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, "Forensic record contains timestamp");
+
+# Test 4: Verify forensic record contains source file
+like($forensic_content, qr/test_overlong\.log/, "Forensic record contains source file");
+
+# Test 5: Verify forensic record contains original length
+like($forensic_content, qr/\|200\|/, "Forensic record contains original length");
+
+# Test 6: Verify append-only behavior (second overlong line appends)
+main::process_line($overlong_line, "second_source.log");
+my @lines = split /\n/, do {
+    local $/;
+    open my $rfh, '<', $temp_forensic_file;
+    <$rfh>;
+};
+is(scalar(@lines), 2, "Multiple overlong lines append to forensic file");
+
+# Restore original MAX_LINE_LEN
+$main::MAX_LINE_LEN = $original_max;
+
+done_testing();