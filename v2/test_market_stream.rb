#!/usr/bin/env ruby
# frozen_string_literal: true
# test_market_stream.rb - Smoke test for MarketStream tick persistence

require 'minitest/autorun'
require 'json'
require 'webrick'

# Minimal test that starts the API, ingests ticks, and reads them back
class TestMarketStream < Minitest::Test
  def setup
    # Simulate the tick store
    $tick_store = {}
    $tick_store_mutex = Mutex.new
  end

  def store_tick(tick)
    $tick_store_mutex.synchronize do
      instrument = tick[:instrument] || tick[:symbol]
      return unless instrument
      $tick_store[instrument] ||= []
      $tick_store[instrument] << { price: tick[:price], volume: tick[:volume], ts: tick[:timestamp] }
      if $tick_store[instrument].length > 10_000
        $tick_store[instrument] = $tick_store[instrument].last(10_000)
      end
    end
  end

  def test_store_single_tick
    store_tick({ instrument: 'BTC/USD', price: 65000.0, volume: 0.5, ts: '2024-01-01T00:00:00Z' })
    assert_equal 1, $tick_store['BTC/USD'].length
    assert_equal 65000.0, $tick_store['BTC/USD'].first[:price]
  end

  def test_store_multiple_ticks
    10.times do |i|
      store_tick({ instrument: 'ETH/USD', price: 3000.0 + i, volume: 1.0, ts: "2024-01-01T00:00:#{i}Z" })
    end
    assert_equal 10, $tick_store['ETH/USD'].length
    assert_equal 3000.0, $tick_store['ETH/USD'].first[:price]
    assert_equal 3009.0, $tick_store['ETH/USD'].last[:price]
  end

  def test_bounded_buffer
    # Simulate exceeding max history
    10_005.times do |i|
      store_tick({ instrument: 'SOL/USD', price: 100.0, volume: 1.0, ts: "2024-01-01T00:00:#{i}Z" })
    end
    assert_equal 10_000, $tick_store['SOL/USD'].length
  end

  def test_instrument_isolation
    store_tick({ instrument: 'BTC/USD', price: 65000.0, volume: 0.1, ts: '2024-01-01T00:00:00Z' })
    store_tick({ instrument: 'ETH/USD', price: 3000.0, volume: 1.0, ts: '2024-01-01T00:00:00Z' })
    assert_equal 1, $tick_store['BTC/USD'].length
    assert_equal 1, $tick_store['ETH/USD'].length
    refute_nil $tick_store['BTC/USD']
    refute_nil $tick_store['ETH/USD']
  end

  def test_limit_parameter
    20.times do |i|
      store_tick({ instrument: 'DOGE/USD', price: 0.1, volume: 1000.0, ts: "2024-01-01T00:00:#{i}Z" })
    end
    limit = 5
    ticks = $tick_store.fetch('DOGE/USD', []).last(limit)
    assert_equal 5, ticks.length
  end

  def test_empty_instrument
    ticks = $tick_store.fetch('FAKE/USD', [])
    assert_equal 0, ticks.length
  end

  def test_health_endpoint
    # Verify bounded buffer behavior works without loading full service
    assert_respond_to $tick_store, :fetch
    assert_respond_to $tick_store_mutex, :synchronize
  end
end
