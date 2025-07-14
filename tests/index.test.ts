import { expect, test, vi } from "vitest";
import { DeferredCleanUpMap } from "../src";

test("should create and release a resource", () => {
	const createFn = vi
		.fn()
		.mockImplementation((key: string) => `resource-${key}`);
	const cleanupFn = vi.fn().mockImplementation((done) => {
		done();
		return () => {};
	});

	const map = new Map();
	const dcm = new DeferredCleanUpMap(map, createFn, cleanupFn);

	// First obtain
	const [resource, release] = dcm.obtain("test");
	expect(resource).toBe("resource-test");
	expect(createFn).toHaveBeenCalledTimes(1);
	expect(map.size).toBe(1);

	// Release
	release();
	expect(map.size).toBe(0);
	expect(cleanupFn).toHaveBeenCalledTimes(1);
});

test("should handle multiple references to the same resource", () => {
	const createFn = vi
		.fn()
		.mockImplementation((key: string) => `resource-${key}`);
	const cleanupFn = vi.fn().mockImplementation((done) => {
		done();
		return () => {};
	});

	const map = new Map();
	const dcm = new DeferredCleanUpMap(map, createFn, cleanupFn);

	// First obtain
	const [resource1, release1] = dcm.obtain("test");
	const [resource2, release2] = dcm.obtain("test");

	expect(resource1).toBe("resource-test");
	expect(resource2).toBe("resource-test");
	expect(createFn).toHaveBeenCalledTimes(1);
	expect(map.size).toBe(1);

	// Release first reference
	release1();
	expect(map.size).toBe(1); // Should still be in map
	expect(cleanupFn).not.toHaveBeenCalled();

	// Release second reference
	release2();
	expect(map.size).toBe(0);
	expect(cleanupFn).toHaveBeenCalledTimes(1);
});

test("should handle async cleanup", async () => {
	let cleanupDone: () => void = () => {};
	const cleanupFn = vi.fn().mockImplementation((done) => {
		cleanupDone = done;
		return () => {};
	});

	const map = new Map();
	const dcm = new DeferredCleanUpMap(
		map,
		(key) => `resource-${key}`,
		cleanupFn,
	);

	// Obtain and release
	const [_, release] = dcm.obtain("test");
	release();

	expect(map.size).toBe(1); // Still in map because cleanup is async

	// Complete async cleanup
	cleanupDone();
	expect(map.size).toBe(0);
});

test("should abort pending cleanup when resource is re-obtained", () => {
	let cleanupDone: () => void = () => {};
	let abortCalled = false;

	const cleanupFn = vi.fn().mockImplementation((done) => {
		cleanupDone = done;
		return () => {
			abortCalled = true;
		};
	});

	const map = new Map();
	const dcm = new DeferredCleanUpMap(
		map,
		(key) => `resource-${key}`,
		cleanupFn,
	);

	// First obtain and release
	const [_, release1] = dcm.obtain("test");
	release1();

	// At this point, cleanup should be called but not completed
	expect(cleanupFn).toHaveBeenCalledTimes(1);
	expect(map.size).toBe(1);

	// Re-obtain before cleanup completes
	const [resource2, release2] = dcm.obtain("test");
	expect(resource2).toBe("resource-test");
	expect(map.size).toBe(1);

	// The abort function should have been called when we re-obtained
	expect(abortCalled).toBe(true);

	// Complete the cleanup - it should be a no-op since we re-obtained
	cleanupDone();
	expect(map.size).toBe(1); // Should still be in map

	// Now release the second reference
	release2();

	// The cleanup should be called again
	expect(cleanupFn).toHaveBeenCalledTimes(2);
});

test("should handle synchronous cleanup", () => {
	const cleanupFn = vi.fn().mockImplementation((done) => {
		// Call done synchronously
		done();
		return () => {};
	});

	const map = new Map();
	const dcm = new DeferredCleanUpMap(
		map,
		(key) => `resource-${key}`,
		cleanupFn,
	);

	// Obtain and release
	const [, release] = dcm.obtain("test");
	release();

	// Resource should be immediately removed since cleanup is synchronous
	expect(map.size).toBe(0);
	expect(cleanupFn).toHaveBeenCalledTimes(1);

	// Verify we can re-obtain the resource
	const [resource2, release2] = dcm.obtain("test");
	expect(resource2).toBe("resource-test");
	expect(map.size).toBe(1);

	release2();
});

test("should handle mixed sync and async cleanup scenarios", () => {
	let asyncCleanupDone: () => void = () => {};

	const cleanupFn = vi.fn().mockImplementation((done) => {
		// First call is sync, second is async
		if (cleanupFn.mock.calls.length === 1) {
			done(); // First cleanup is sync
		} else {
			asyncCleanupDone = done; // Second cleanup is async
		}
		return () => {};
	});

	const map = new Map();
	const dcm = new DeferredCleanUpMap(
		map,
		(key) => `resource-${key}`,
		cleanupFn,
	);

	// First obtain and release (sync cleanup)
	const [_, release1] = dcm.obtain("test");
	release1();

	// Should be immediately cleaned up
	expect(map.size).toBe(0);
	expect(cleanupFn).toHaveBeenCalledTimes(1);

	// Second obtain and release (async cleanup)
	const [, release2] = dcm.obtain("test");
	release2();

	// Should still be in map (async cleanup)
	expect(map.size).toBe(1);
	expect(cleanupFn).toHaveBeenCalledTimes(2);

	// Complete async cleanup
	asyncCleanupDone();
	expect(map.size).toBe(0);
});

test("should throw when releasing an already released resource", () => {
	const dcm = new DeferredCleanUpMap(
		new Map(),
		(key) => `resource-${key}`,
		(done) => {
			done();
			return () => {};
		},
	);

	const [_, release] = dcm.obtain("test");
	release();

	expect(() => release()).toThrow("Already released");
});
