export abstract class Entity<TId extends string = string> {
  protected constructor(readonly id: TId) {}

  equals(other: Entity<TId> | null | undefined): boolean {
    return other != null && other.constructor === this.constructor && other.id === this.id;
  }
}
