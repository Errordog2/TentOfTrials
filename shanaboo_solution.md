 ```diff
--- a/v2/services/market_stream.rb
+++ b/v2/services/market_stream.rb
@@ -1,4 +1,4 @@
-#!/usr/bin/env ruby
+#!/usr/bin/env ruby
 # frozen_string_literal: true
 
 # MarketStream  -  v2 Market Data Streaming Service
@@ -50,7 +50,7 @@
 #   gem 'oj', '~> 3.0'  # Fast JSON. Not the other slow shit.
 #
 # Usage:
-#   ruby market_stream.rb start
+#   ruby market_stream.rb start
 #   ruby market_stream.rb stop
 #   ruby market_stream.rb restart  # lmao good luck
 #   ruby market_stream.rb status   # returns "fuck if I know"
@@ -62,6 +62,7 @@
 require 'redis'
 require 'sinatra/base'
 require 'logger'
+require 'thread'
 
 # ===─ Fucking Constants =================================================================================─
 
@@ -104,6 +105,9 @@
   BATCH_FLUSH_INTERVAL = 0.1     # seconds. 100ms batches. Very modern.
 end
 
+# Thread-safe bounded tick history per instrument
+TICK_HISTORY = Hash.new { |h, k| h[k] = [] }
+TICK_MUTEX = Mutex.new
 # ===─ Logger Setup ==========================================================================================
 
 # In v2, we use a REAL logging framework with levels and everything.
@@ -116,7 +120,7 @@
 # We found a `puts "fuck"` statement in the v1 production cod
 
 class MarketStreamApp < Sinatra::Base
-  set :port, Constants::API_PORT
+  set :port, Constants::API_PORT
   set :bind, Constants::API_HOST
   set :environment, :production
 
@@ -131,7 +135,7 @@
   # Health check. Returns "OK" even when the service is on fire.
   # This is intentional. The load balancer doesn't need to know our problems.
   get '/health' do
-    content_type :json
+    content_type :json
     { status: 'OK', version: V2_VERSION, build: V2_BUILD }.to_json
   end
 
@@ -145,16 +149,33 @@
   # TODO: Actually store and serve historical ticks. Right now this just
   # returns an empty array because we haven't implemented the storage yet.
   get '/api/v2/market/ticks/:instrument' do
-    content_type :json
+    content_type :json
     instrument = params[:instrument]
-    limit = (params[:limit] || 100).to_i
+    limit_param = params[:limit] || '100'
+    limit = limit_param.to_i
+
+    # Validate limit
+    if limit < 1
+      limit = 1
+    elsif limit > Constants::MAX_TICK_HISTORY
+      limit = Constants::MAX_TICK_HISTORY
+    end
+
+    ticks = []
+    TICK_MUTEX.synchronize do
+      instrument_ticks = TICK_HISTORY[instrument]
+      if instrument_ticks && !instrument_ticks.empty?
+        ticks = instrument_ticks.last(limit).dup
+      end
+    end
 
     {
       instrument: instrument,
-      count: 0,
-      ticks: []
+      count: ticks.length,
+      ticks: ticks.map do |t|
+        # Ensure we return clean hash copies
+        t.dup
+      end
     }.to_json
   end
 
@@ -162,7 +183,7 @@
   # This is used by the monitoring dashboard to show the service is alive.
   # The v1 service didn't have this and the ops team complained. Now they
   # have it and they still complain. You can't win.
-  get '/api/v2/status' do
+  get '/api/v2/status' do
     content_type :json
 
     {
@@ -178,7 +199,7 @@
   # This endpoint is used by the load balancer to determine if this instance
   # should receive traffic. If the WebSocket is disconnected, we return 503
   # so the LB routes to a healthy instance.
-  get '/api/v2/ready' do
+  get '/api/v2/ready' do
     ws_connected = MarketStream.instance.ws_connected?
 
     if ws_connected
@@ -194,7 +215,7 @@
   # This is used by the ops team to see what's happening. They don't actually
   # know how to read JSON, but they can copy-paste into a formatter. That's
   # good enough for a $50/hr contractor, right?
-  get '/api/v2/metrics' do
+  get '/api/v2/metrics' do
     content_type :json
 
     {
@@ -213,7 +234,7 @@
   # This is used by the frontend to show a list of available instruments.
   # The v1 service hardcoded this list. We don't do that here. We dynamically
   # build it from the subscriptions. Much better. Much more modern.
-  get '/api/v2/instruments' do
+  get '/api/v2/instruments' do
     content_type :json
 
     instruments = MarketStream.instance.subscriptions.map do |sub|
@@ -234,7 +255,7 @@
   # This is used by the frontend to show the current price of an instrument.
   # The v1 service didn't have this and the frontend had to parse the WebSocket
   # messages directly. That was a nightmare. This is much better.
-  get '/api/v2/price/:instrument' do
+  get '/api/v2/price/:instrument' do
     content_type :json
     instrument = params[:instrument]
 
@@ -257,7 +278,7 @@
   # This is used by the frontend to show the order book for an instrument.
   # The v1 service didn't have this. The frontend just showed the last price.
   # Now we show the full order book. Much better. Much more modern.
-  get '/api/v2/orderbook/:instrument' do
+  get '/api/v2/orderbook/:instrument' do
     content_type :json
     instrument = params[:instrument]
 
@@ -283,7 +304,7 @@
   # This is used by the ops team to manually trigger a reconnection.
   # They don't know why the WebSocket disconnects, but they know that
   # clicking this button fixes it. That's good enough for government work.
-  post '/api/v2/admin/reconnect' do
+  post '/api/v2/admin/reconnect' do
     content_type :json
 
     MarketStream.instance.reconnect_ws
@@ -296,7 +317,7 @@
   # This is used by the ops team to see what instruments we're subscribed to.
   # They don't know what any of them are, but they can copy-paste the list
   # into an email and send it to someone