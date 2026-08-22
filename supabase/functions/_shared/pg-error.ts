export const isForeignKeyViolation = (error: unknown): boolean => (
  (error as { code?: string } | null)?.code === '23503'
);

export const isUniqueViolation = (error: unknown): boolean => (
  (error as { code?: string } | null)?.code === '23505'
);
