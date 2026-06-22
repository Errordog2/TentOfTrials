# Fix for Issue #5: [$50 BOUNTY] [Ruby] Move MarketStream tick flush to a bounded async ring buffer

# v2/services/market_stream.rb
require 'v2/lib/ring_buffer'

class MarketStream
  def initialize
    @tick_buffer = RingBuffer.new(1000) # bounded ring buffer with size 1000
    @on_tick = nil
    @drain_worker = nil
  end

  def on_tick(&block)
    @on_tick = block
  end

  def flush_buffer
    # Add ticks to the ring buffer
    @tick_buffer.push(@ticks)
    # Start the drain worker if not already running
    start_drain_worker unless @drain_worker
  end

  private

  def start_drain_worker
    @drain_worker = Thread.new do
      loop do
        # Drain the ring buffer
        batch = @tick_buffer.pop
        # Call the on_tick callback for normal batches
        @on_tick.call(batch) if @on_tick
        # Sleep for a short duration to avoid busy-waiting
        sleep 0.01
      end
    end
  end
end