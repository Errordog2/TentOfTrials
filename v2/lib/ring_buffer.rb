# Fix for Issue #5: [$50 BOUNTY] [Ruby] Move MarketStream tick flush to a bounded async ring buffer

# v2/lib/ring_buffer.rb
class RingBuffer
  def initialize(size)
    @size = size
    @buffer = []
    @mutex = Mutex.new
  end

  def push(item)
    @mutex.synchronize do
      # If the buffer is full, remove the oldest item
      @buffer.shift if @buffer.size >= @size
      @buffer.push(item)
    end
  end

  def pop
    @mutex.synchronize do
      # If the buffer is empty, return nil
      return nil if @buffer.empty?
      @buffer.shift
    end
  end
end