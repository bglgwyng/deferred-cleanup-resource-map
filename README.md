# Deferred Cleanup Resource Map

A utility that manages resources with deferred cleanup. This map allows you to
release resources without immediately deleting them, providing a grace period
before actual cleanup occurs.

## Features

- **Reference Counting**: Tracks how many times a resource is being used
- **Deferred Cleanup**: Delays resource cleanup until all references are
  released
- **Thread-safe**: Handles concurrent access patterns safely
- **Graceful Shutdown**: Provides a way to abort pending cleanups when resources
  are reacquired

## How It Works

1. When you obtain a resource using `obtain(key)`, it either creates a new
   resource or increments the reference count of an existing one.
2. When you release a resource, instead of immediately cleaning it up, it waits
   for the cleanup callback to be called.
3. If the resource is re-obtained before cleanup completes, the pending cleanup
   is aborted.
4. The actual cleanup only occurs when:
   - All references to the resource are released
   - The cleanup callback is called
   - The resource isn't re-obtained during the cleanup period

## Basic Usage

```typescript
import { DeferredCleanUpMap } from "deferred-cleanup-map";

// Create a map with cleanup logic
const map = new DeferredCleanUpMap<number, Resource>(
  new Map(),
  (key) => new Resource(key), // create function
  (key, value, done) => {
    // This is called when a resource is ready to be cleaned up
    const timer = setTimeout(() => {
      done(); // Call this when cleanup is complete
    }, 5000); // 5 second delay before actual cleanup

    return () => clearTimeout(timer); // Return cleanup abort function
  },
);

// Obtain a resource
const [resource, release] = map.obtain(1);

// Later, when done with the resource
release(); // This schedules cleanup, but doesn't immediately delete
```

## Use Cases

- Managing database connections with connection pooling
- Caching expensive resources
- Managing WebSocket connections with idle timeouts
- Any scenario where you want to keep resources alive for a short time after
  they're no longer needed
