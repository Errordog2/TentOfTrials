 ```diff
--- a/v2/services/market_stream.rb
+++ b/v2/services/market_stream.rb
@@ -1,4 +1,4 @@
-#!/usr/bin/env ruby
+#!/usr/bin/env ruby
 # frozen_string_literal: true
 
 # MarketStream  -  v2 Market Data Streaming Service
@@ -96,6 +96,7 @@
 # We found a `puts "fuck"` statement in the v1 production cod
 
 require 'json'
+require 'thread'
 require 'digest'
 require 'eventmachine'
 require 'em-websocket-client'
@@ -153,6 +154,9 @@
   MAX_SUBSCRIPTIONS    = 100     # per connection. v1 had 10. We're woke now.
   BATCH_FLUSH_INTERVAL = 0.1     # seconds. 100ms batches. Very modern.
 end
+
+# Default limit for tick queries
+DEFAULT_TICK_LIMIT = 100
 
 # ===─ Bounded Tick History =================================================================================
 
@@ -160,6 +164,7 @@
 # In-memory bounded buffer for recent ticks per instrument.
 # Thread-safe because EventMachine may access this from different
 # callbacks (though EM is single-threaded, better safe than sorry).
+# Thread-safe because EventMachine may access this from different
 class BoundedTickHistory
   def initialize(max_size = Constants::MAX_TICK_HISTORY)
     @max_size = max_size
@@ -167,6 +172,7 @@
     @mutex = Mutex.new
   end
 
+  # Store a tick for the given instrument, evicting oldest if at capacity.
   def store(instrument, tick)
     @mutex.synchronize do
       @history[instrument] ||= []
@@ -175,6 +181,7 @@
     end
   end
 
+  # Retrieve recent ticks for an instrument, optionally limited to +limit+ items.
   def recent(instrument, limit = nil)
     @mutex.synchronize do
       ticks = @history[instrument] || []
@@ -182,6 +189,7 @@
     end
   end
 
+  # Count of stored ticks for an instrument.
   def count(instrument)
     @mutex.synchronize do
       (@history[instrument] || []).size
@@ -189,6 +197,7 @@
   end
 
   # For testing / introspection
+  # Clear all stored history.
   def clear
     @mutex.synchronize do
       @history.clear
@@ -196,6 +205,7 @@
   end
 end
 
+# Global tick history instance
 TICK_HISTORY = BoundedTickHistory.new
 
 # ===─ Sinatra API ===========================================================================================
@@ -211,6 +221,7 @@
     content_type :json
   end
 
+  # Health check endpoint
   get '/health' do
     {
       status: 'OK',
@@ -219,6 +230,7 @@
     }.to_json
   end
 
+  # Status endpoint
   get '/api/v2/status' do
     {
       version: V2_VERSION,
@@ -228,6 +240,7 @@
     }.to_json
   end
 
+  # Return recent ticks for the requested instrument.
   get '/api/v2/market/ticks/:instrument' do
     instrument = params[:instrument]
     limit_param = params[:limit]
@@ -235,6 +248,7 @@
     # Validate limit if provided
     limit = DEFAULT_TICK_LIMIT
     if limit_param
+      # Validate limit is a positive integer
       begin
         limit = Integer(limit_param)
         limit = DEFAULT_TICK_LIMIT if limit <= 0
@@ -251,6 +265,7 @@
     limit = [弥ax_limit if limit > max_limit
 
     ticks = TICK_HISTORY.recent(instrument, limit)
+    # Return ticks in chronological order (oldest first)
     {
       instrument: instrument,
       count: ticks.size,
@@ -258,6 +273,7 @@
     }.to_json
   end
 
+  # Catch-all for 404s
   not_found do
     {
       error: 'Not found',
@@ -266,6 +282,7 @@
   end
 end
 
+# ===─ WebSocket Client =====================================================================================
 
 # WebSocket client that connects to the exchange and normalizes ticks.
 class MarketStreamClient
@@ -283,6 +300,7 @@
     @redis = redis
   end
 
+  # Start the WebSocket connection
   def start
     @ws = EventMachine::WebSocketClient.connect(@url)
 
@@ -291,6 +309,7 @@
       @connected = true
       @reconnect_attempts = 0
 
+      # Subscribe to instruments if we have any
       @subscriptions.each do |instrument|
         subscribe(instrument)
       end
@@ -298,6 +317,7 @@
 
     @ws.stream do |msg|
       if msg.type == :text
+        # Parse and handle the message
         handle_message(msg.data)
       end
     end
@@ -305,6 +325,7 @@
     @ws.disconnect do
       @connected = false
       @logger.warn "Disconnected from #{@url}"
+      # Attempt reconnection
       schedule_reconnect
     end
   end
@@ -312,6 +333,7 @@
   def subscribe(instrument)
     return unless @connected
 
+    # Send subscription message
     msg = {
       action: 'subscribe',
       instrument: instrument
@@ -321,6 +343,7 @@
   def handle_message(data)
     begin
       payload = JSON.parse(data)
+      # Normalize and process the tick
       process_tick(payload)
     rescue JSON::ParserError => e
       @logger.error "Failed to parse message: #{e.message}"
@@ -328,6 +351,7 @@
    end
 
   def process_tick(payload)
 HTick.new(payload['instrument'], payload['price'], payload['volume'], payload['timestamp'])
+    # Store in bounded history and publish to Redis
     TICK_HISTORY.store(tick.instrument, tick.to_h)
     @redis.publish("#{REDIS_CHANNEL_PREFIX}#{tick.instrument}", tick.to_json)
   end
@@ -335,6 +359,7 @@
   def schedule_reconnect
     return if @reconnect_attempts >= (Constants::WS_MAX_RECONNECTS || Float::INFINITY)
 
+    # Calculate backoff delay
     delay = [Constants::WS_RECONNECT_BASE * (2 ** @reconnect_attempts), Constants::WS_RECONNECT_MAX].min
     @reconnect_attempts += 1
 
@@ -344,6 +369,7 @@
     end
   end
 
+  # Graceful shutdown
   def stop
     @ws.close if @ws
   end
@@ -351,6 +377,7 @@
 
 # ===─ Main =================================================================================================
 
+# Run the service if this file is executed directly
 if __FILE__ == $0
   case ARGV[0]
   when 'start'
@@ -362,6 +389,7 @@
       EventMachine.run