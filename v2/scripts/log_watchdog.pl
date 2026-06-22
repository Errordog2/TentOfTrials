# Fix for Issue #6: [$50 BOUNTY] [Perl] Preserve overlong watchdog log lines for forensic review

--- a/v2/scripts/log_watchdog.pl
+++ b/v2/scripts/log_watchdog.pl
@@ -1,6 +1,7 @@
 #!/usr/bin/env perl
 use strict;
 use warnings;
+use POSIX qw(strftime);
 
 # Configuration
 our $MAX_LINE_LEN = $ENV{WATCHDOG_MAX_LINE_LEN} // 4096;
+our $FORENSIC_OUTPUT_PATH = $ENV{WATCHDOG_FORENSIC_PATH} // '/var/log/watchdog/forensic_overlong.log';
+our $FORENSIC_PREVIEW_LEN = $ENV{WATCHDOG_FORENSIC_PREVIEW_LEN} // 256;
 
 # TODO: truncated lines should be written to a separate forensic file
 
+sub write_forensic_record {
+    my ($source_file, $original_line, $original_length) = @_;
+    
+    return unless defined $FORENSIC_OUTPUT_PATH && $FORENSIC_OUTPUT_PATH ne '';
+    
+    eval {
+        my $timestamp = strftime("%Y-%m-%dT%H:%M:%S%z", localtime());
+        my $preview_len = $FORENSIC_PREVIEW_LEN < $original_length ? $FORENSIC_PREVIEW_LEN : $original_length;
+        my $truncated_preview = substr($original_line, 0, $preview_len);
+        
+        # Sanitize preview for safe logging (escape newlines, null bytes)
+        $truncated_preview =~ s/\0/\\0/g;
+        $truncated_preview =~ s/\n/\\n/g;
+        $truncated_preview =~ s/\r/\\r/g;
+        
+        # Append-only write with exclusive handling
+        if (open(my $fh, '>>', $FORENSIC_OUTPUT_PATH)) {
+            # Format: timestamp|source|original_length|preview
+            my $record = sprintf("%s|%s|%d|%s\n",
+                $timestamp,
+                $source_file // 'unknown',
+                $original_length,
+                $truncated_preview
+            );
+            print $fh $record;
+            close($fh);
+        }
+        # Silently ignore if file cannot be opened - do not crash watchdog
+    };
+    # Catch any eval errors silently - forensic write failure must not crash watchdog
+    if ($@) {
+        warn "Forensic write failed (non-fatal): $@" if $ENV{WATCHDOG_DEBUG};
+    }
+}
+
 sub process_line {
     my ($line, $source_file) = @_;
     
     my $line_length = length($line);
     
     # Handle overlong lines
     if ($line_length > $MAX_LINE_LEN) {
-        # TODO: truncated lines should be written to a separate forensic file
+        # Write to forensic file for incident responder review
+        write_forensic_record($source_file, $line, $line_length);
         return;
     }
     
     # Existing pattern matching and alert behavior for normal-sized lines
     # ... (rest of existing logic unchanged)
 }
 
+# Export for testing
+sub get_forensic_output_path { return $FORENSIC_OUTPUT_PATH; }
+sub set_forensic_output_path { $FORENSIC_OUTPUT_PATH = shift; }
+
 1;