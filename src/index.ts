export class DeferredCleanUpMap<K, V> {
	constructor(
		private resources: MapLike<K, Resource<V>>,
		private create: (key: K) => V,
		private cleanUp: (done: () => void) => () => void,
	) {}

	obtain(key: K): [V, () => void] {
		let resource = this.resources.get(key);

		if (resource === undefined) {
			const newValue = this.create(key);
			resource = new Resource(newValue, 1);
			this.resources.set(key, resource);
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

			const abortCleanUp = this.cleanUp(() => {
				if (state === ReleaseState.WaitCleanUpSync) {
					this.resources.delete(key);
					state = ReleaseState.CleanedUpSync;
				} else {
					if (resource.abortCleanUp === wrappedAbortCleanUp) {
						this.resources.delete(key);
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
