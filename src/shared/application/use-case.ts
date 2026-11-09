/** A single application operation. Inputs and outputs are plain DTOs, never HTTP or ORM types. */
export interface UseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}
