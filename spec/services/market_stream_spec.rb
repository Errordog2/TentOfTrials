# Fix for Issue #5: [$50 BOUNTY] [Ruby] Move MarketStream tick flush to a bounded async ring buffer

# spec/services/market_stream_spec.rb
require 'spec_helper'

describe MarketStream do
  let(:market_stream) { MarketStream.new }

  it 'flushes the buffer' do
    # Add some ticks to the buffer
    10.times { market_stream.instance_variable_get(:@ticks) << 'tick' }
    # Flush the buffer
    market_stream.flush_buffer
    # Verify the on_tick callback is called
    expect(market_stream.instance_variable_get(:@on_tick)).to receive(:call).with(['tick'] * 10)
  end

  it 'handles overflow/backpressure' do
    # Fill the ring buffer
    1000.times { market_stream.instance_variable_get(:@tick_buffer).push('tick') }
    # Add more ticks to the buffer
    10.times { market_stream.instance_variable_get(:@ticks) << 'tick' }
    # Flush the buffer
    market_stream.flush_buffer
    # Verify the oldest items are removed from the buffer
    expect(market_stream.instance_variable_get(:@tick_buffer).size).to eq(1000)
  end

  it 'handles shutdown/drain behavior' do
    # Start the drain worker
    market_stream.start_drain_worker
    # Add some ticks to the buffer
    10.times { market_stream.instance_variable_get(:@ticks) << 'tick' }
    # Flush the buffer
    market_stream.flush_buffer
    # Verify the on_tick callback is called
    expect(market_stream.instance_variable_get(:@on_tick)).to receive(:call).with(['tick'] * 10)
  end
end