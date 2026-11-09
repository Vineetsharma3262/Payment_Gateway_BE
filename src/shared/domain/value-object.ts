/** Immutable, compared by value. Subclasses validate in their factory methods. */
export abstract class ValueObject<TProps extends object> {
  protected readonly props: Readonly<TProps>;

  protected constructor(props: TProps) {
    this.props = Object.freeze({ ...props });
  }

  equals(other: ValueObject<TProps> | null | undefined): boolean {
    if (other == null || other.constructor !== this.constructor) return false;
    const a = this.props as Record<string, unknown>;
    const b = other.props as Record<string, unknown>;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
  }
}
