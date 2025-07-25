export class DeferredCleanUpMap<K, V> {
	constructor(
		private create: (key: K) => V,
		private cleanUp: (key: K, value: V, done: () => void) => () => void,
		private container: MapLike<K, Resource<V>> = new Map(),
	) {}

	obtain(key: K): [V, () => void] {
		let resource = this.container.get(key);

		if (resource === undefined) {
			const newValue = this.create(key);
			resource = new Resource(newValue, 1);
			this.container.set(key, resource);
		} else {
			if (resource.refCount === 0) {
				// biome-ignore lint/style/noNonNullAssertion: if `refCount` is 0, then at least one `release` must be called, so `abortCleanUp` must be set
				resource.abortCleanUp!();
				resource.abortCleanUp = undefined;
			}
			resource.refCount++;
		}

		let released = false;
		const release = () => {
			if (released) throw new Error("Already released");
			released = true;

			resource.refCount--;
			if (resource.refCount !== 0) return;

			let state = ReleaseState.WaitCleanUpSync;

			const abortCleanUp = this.cleanUp(key, resource.value, () => {
				if (state === ReleaseState.WaitCleanUpSync) {
					this.container.delete(key);
					state = ReleaseState.CleanedUpSync;
				} else {
					if (resource.abortCleanUp === wrappedAbortCleanUp) {
						this.container.delete(key);
					}
				}
			});

			let wrappedAbortCleanUp: () => void;

			if (state === ReleaseState.WaitCleanUpSync) {
				wrappedAbortCleanUp = () => {
					abortCleanUp();
				};
				resource.abortCleanUp = wrappedAbortCleanUp;
				state = ReleaseState.WaitCleanUpAsync;
			}
		};

		return [resource.value, release];
	}
}

export type MapLike<K, V> = {
	get(key: K): V | undefined;
	set(key: K, value: V): void;
	delete(key: K): boolean;
};

class Resource<V> {
	public abortCleanUp?: () => void;
	constructor(
		public value: V,
		public refCount: number,
	) {}
}

enum ReleaseState {
	WaitCleanUpSync,
	WaitCleanUpAsync,
	CleanedUpSync,
}
