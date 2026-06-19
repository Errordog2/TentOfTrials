 ```diff
--- a/v2/services/market_stream.rb
+++ b/v2/services/market_stream.rb
@@ -1,4 +1,4 @@
-#!/usr/bin/env ruby
+#!/usr/bin/env ruby
 # frozen_string_literal: true
 
 # MarketStream  -  v2 Market Data Streaming Service
@@ -85,6 +85,7 @@
 require 'sinatra/base'
 require 'logger'
 
+require_relative '../lib/ring_buffer'
 # ===─ Fucking Constants =================================================================================─
 
 V2_VERSION = '2.0.0'
@@ -147,6 +148,7 @@
   BATCH_FLUSH_INTERVAL = 0.1     # seconds. 100ms batches. Very modern.
 end
 
+
 # ===─ Logger Setup ==========================================================================================
 
 # In v2, we use a REAL logging framework with levels and everything.
@@ -213,6 +215,7 @@
   end
 end
 
+
 # ===─ MarketStream Core ===================================================================================
 
 class MarketStream
@@ -228,6 +231,9 @@
     @buffer_mutex = Mutex.new
     @tick_buffer = []
     @flush_timer = nil
+    @ring_buffer = RingBuffer.new(1000) # bounded ring buffer for tick batches
+    @drain_thread = nil
+    @shutdown = false
 
     # Callbacks
     @on_tick = nil
@@ -248,8 +254,8 @@
   # Start the stream (connects WebSocket, starts timers, etc.)
   def start
     logger.info "[MarketStream] Starting v#{V2_VERSION} (build #{V2_BUILD})"
-
     connect_ws
+    start_drain_worker
     start_flush_timer
   end
 
@@ -257,8 +263,9 @@
   def stop
     logger.info "[MarketStream] Stopping..."
     @flush_timer&.cancel
+    @shutdown = true
+    @ring_buffer.close if @ring_buffer
     disconnect_ws
-    flush_buffer # final flush
   end
 
   # Register a callback for each tick batch
@@ -310,6 +317,7 @@
     end
   end
 
+
   # ===─ Buffer / Flush Logic ================================================================================
 
   def start_flush_timer
@@ -324,25 +332,49 @@
     end
   end
 
-  # TODO: This is fucking terrible. We copy the buffer under a mutex, clear it,
-  # then start an ad-hoc thread for every flush. At high throughput this blocks
-  # and spawns threads like rabbits. We need a real bounded queue and a single
-  # drain worker. Someone should write v2/lib/ring_buffer.rb and replace this.
+  # Flush the current tick buffer into the ring buffer as a batch.
+  # The ring buffer handles backpressure; if full, oldest batch is dropped.
   def flush_buffer
     batch = nil
     @buffer_mutex.synchronize do
       batch = @tick_buffer.dup
       @tick_buffer.clear
     end
-
     return if batch.nil? || batch.empty?
+    @ring_buffer.push(batch)
+  end
 
-    Thread.new do
-      process_batch(batch)
-    end
+  # Start a single drain worker thread that consumes batches from the ring buffer.
+  def start_drain_worker
+    @drain_thread = Thread.new do
+      loop do
+        break if @shutdown && @ring_buffer.empty?
+        batch = @ring_buffer.pop(timeout: 0.5)
+        if batch
+          process_batch(batch)
+        end
+      end
+    end
+  end
+
+  # Wait for the drain worker to finish processing remaining batches.
+  def drain
+    # Push a sentinel to ensure the worker wakes up if needed
+    @ring_buffer.push(:drain) unless @shutdown
+  end
+
+  # Graceful shutdown: signal shutdown, close ring buffer, wait for drain worker.
+  def shutdown!
+    @shutdown = true
+    @flush_timer&.cancel
+    @ring_buffer.close
+    @drain_thread&.join(5)
+    # Final flush of any remaining ticks
+    final_batch = nil
+    @buffer_mutex.synchronize do
+      final_batch = @tick_buffer.dup
+      @tick_buffer.clear
+    end
+    process_batch(final_batch) if final_batch && !final_batch.empty?
   end
 
   def process_batch(batch)
@@ -356,6 +388,7 @@
     end
   end
 
+
   # ===─ WebSocket Handlers ==================================================================================
 
   def on_open
@@ -411,6 +444,7 @@
     end
   end
 
+
   # ===─ Helpers =============================================================================================
 
   def generate_subscription_id
@@ -431,6 +465,7 @@
   end
 end
 
+
 # ===─ Sinatra API ==========================================================================================
 
 class MarketStreamAPI < Sinatra::Base
@@ -478,6 +513,7 @@
   end
 end
 
+
 # ===─ CLI Entrypoint =======================================================================================
 
 if __FILE__ == $0
@@ -496,6 +532,7 @@
     stream = MarketStream.new
     stream.start
     MarketStreamAPI.set :stream, stream
+    at_exit { stream.shutdown! }
     MarketStreamAPI.run! host: Constants::API_HOST, port: Constants::API_PORT
   when 'stop'
     puts "MarketStream stop not implemented. Use kill -9 like a civilized person."
--- /dev/null
+++ b/v2/lib/ring_buffer.rb
@@ -0,0 +1,95 @@
+# frozen_string_literal: true
+
+# RingBuffer - A bounded, thread-safe ring buffer for batch processing.
+#
+# Throughput/backpressure behavior:
+# - push: O(1). If the buffer is full, the oldest item is dropped (overwrite).
+# - pop:  O(1). Blocks until an item is available or timeout.
+# - Thread-safe via Mutex + ConditionVariable.
+# - Designed for high-throughput tick batching where unbounded growth is fatal.
+# - Backpressure: oldest batch dropped on overflow, so consumers always get the
+#   most recent data. This is preferable to unbounded memory growth or blocking
+#   producers in a market data context.
+
+class RingBuffer
+  class ClosedError < StandardError; end
+
+  # @param capacity [Integer] Maximum number of items in the buffer.
+  def initialize(capacity)
+    raise ArgumentError, 'capacity must be positive' unless capacity.is_a?(Integer) && capacity > 0
+    @capacity = capacity
+    @buffer = []
+    @mutex = Mutex.new
+    @cond = ConditionVariable.new
+    @closed = false
+  end
+
+  # Push an item into the ring buffer.
+  # If the buffer is full, the oldest item is dropped.
+  # Raises ClosedError if the buffer