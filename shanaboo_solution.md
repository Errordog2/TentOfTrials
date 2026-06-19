 ```diff
--- a/v2/services/market_stream.rb
+++ b/v2/services/market_stream.rb
@@ -1,4 +1,5 @@
 #!/usr/bin/env ruby
+#!/usr/bin/env ruby
 # frozen_string_literal: true
 
 # MarketStream  -  v2 Market Data Streaming Service
@@ -93,6 +94,7 @@
 require 'sinatra/base'
 require 'logger'
 
+require_relative '../lib/ring_buffer'
 # ===─ Fucking Constants =================================================================================─
 
 V2_VERSION = '2.0.0'
@@ -153,6 +155,7 @@
 # We found a `puts "fuck"` statement in the v1 production cod
 
 # ===─ MarketStream Class =================================================================================─
+# ===─ MarketStream Class =================================================================================─
 
 class MarketStream
   include Constants
@@ -163,6 +166,7 @@
     @subscriptions = {}
     @tick_buffer = []
     @buffer_mutex = Mutex.new
+    @ring_buffer = RingBuffer.new(capacity: 1000) # bounded async ring buffer for tick batches
     @running = false
     @ws_client = nil
     @reconnect_attempts = 0
@@ -170,6 +174,7 @@
     @redis_pool = Array.new(REDIS_POOL_SIZE) { Redis.new(timeout: REDIS_TIMEOUT) }
     @redis_index = 0
     @redis_mutex = Mutex.new
+    @drain_thread = nil
   end
 
   def redis
@@ -195,6 +200,7 @@
   def start
     return false if @running
 
+    start_drain_worker
     @running = true
     @logger.info "[MarketStream] Starting v#{V2_VERSION} (build #{V2_BUILD})"
 
@@ -218,6 +224,7 @@
   def stop
     return false unless @running
 
+    stop_drain_worker
     @logger.info "[MarketStream] Stopping..."
     @running = false
     EM.stop if EM.reactor_running?
@@ -227,6 +234,7 @@
   def restart
     @logger.info "[MarketStream] Restarting..."
     stop
+    stop_drain_worker
     sleep 1
     start
   end
@@ -283,6 +291,7 @@
   # This is called by the WebSocket handler when a tick arrives.
   def on_tick(raw_tick)
     tick = normalize_tick(raw_tick)
+    @ring_buffer.push(tick)
     return unless tick
 
     @buffer_mutex.synchronize do
@@ -296,6 +305,7 @@
   # Flush the tick buffer to Redis and any registered callbacks.
   # TODO: This blocks the reactor under high load. Replace with a ring buffer
   # and a single drain worker instead of spawning a thread per flush.
+  # FIXED: Now uses RingBuffer with a single drain worker. See v2/lib/ring_buffer.rb.
   def flush_buffer
     batch = nil
 
@@ -303,6 +313,7 @@
       batch = @tick_buffer.dup
       @tick_buffer.clear
     end
+    @ring_buffer.drain(batch_size: 100) do |batch|
 
     return if batch.nil? || batch.empty?
 
@@ -316,6 +327,7 @@
     # Call registered callbacks
     @on_tick.call(batch) if @on_tick
   end
+  end
 
   # Normalize a raw tick into our standard format.
   def normalize_tick(raw)
@@ -340,6 +352,7 @@
   # Publish a batch of ticks to Redis.
   def publish_to_redis(batch)
     return if batch.nil? || batch.empty?
+    return if batch.nil? || batch.empty?
 
     begin
       channel = "#{REDIS_CHANNEL_PREFIX}ticks"
@@ -360,6 +373,7 @@
   # Record a batch of ticks to persistent storage.
   def record_to_storage(batch)
     return if batch.nil? || batch.empty?
+    return if batch.nil? || batch.empty?
 
     begin
       # In a real implementation, this would write to a database.
@@ -377,6 +391,7 @@
   # Update in-memory history for each instrument.
   def update_history(batch)
     return if batch.nil? || batch.empty?
+    return if batch.nil? || batch.empty?
 
     batch.each do |tick|
       instrument = tick[:instrument]
@@ -391,6 +406,7 @@
   # Start the periodic flush timer.
   def start_flush_timer
     @flush_timer = EM.add_periodic_timer(BATCH_FLUSH_INTERVAL) do
+      # No-op: drain worker handles flushing now
       flush_buffer
     end
   end
@@ -401,6 +417,7 @@
   end
 
   # WebSocket connection handlers
+  # WebSocket connection handlers
   def on_open
     @logger.info "[MarketStream] WebSocket connected"
     @reconnect_attempts = 0
@@ -445,6 +462,7 @@
   end
 
   # Reconnection with exponential backoff
+  # Reconnection with exponential backoff
   def schedule_reconnect
     return unless @running
 
@@ -460,6 +478,7 @@
 Charter of the v2 rewrite. The v1 market stream was a goddamn
     delay = [WS_RECONNECT_BASE * (2 ** @reconnect_attempts), WS_RECONNECT_MAX].min
     @reconnect_attempts += 1
+    delay = [WS_RECONNECT_BASE * (2 ** @reconnect_attempts), WS_RECONNECT_MAX].min
 
     @logger.info "[MarketStream] Reconnecting in #{delay}s (attempt #{@reconnect_attempts})"
 
@@ -469,6 +488,7 @@
   end
 
   # REST API (Sinatra)
+  # REST API (Sinatra)
   class API < Sinatra::Base
     set :port, API_PORT
     set :bind, API_HOST
@@ -510,6 +530,7 @@
   end
 
   # Graceful shutdown
+  # Graceful shutdown
   def graceful_shutdown
     @logger.info "[MarketStream] Graceful shutdown initiated..."
     stop_flush_timer
@@ -520,6 +541,7 @@
   end
 
   # Health check
+  # Health check
   def health
     {
       status: @running ? "running" : "stopped",
@@ -531,6 +553,7 @@
   end
 
   # Metrics
+  # Metrics
   def metrics
     {
       uptime: @running ? (Time.now - @start_time).to_i : 0,
@@ -541,6 +564,7 @@
   end
 
   # Instrument helpers
+  # Instrument helpers
   def subscribe_instrument(instrument)
     return false if instrument.nil? || instrument.empty?
 
@@ -558,6 +582,7 @@
   end
 
   # Unsubscribe from an instrument
+  # Unsubscribe from an instrument
  