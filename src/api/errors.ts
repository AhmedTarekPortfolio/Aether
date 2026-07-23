export class NotFoundError extends Error {
  constructor(entityName: string, id: string) {
    super(`${entityName} with id "${id}" was not found.`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class StorageError extends Error {
  constructor(operation: string, originalError?: any) {
    super(`Storage failure during ${operation}: ${originalError?.message || originalError}`);
    this.name = 'StorageError';
  }
}
