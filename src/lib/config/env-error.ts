export class AppEnvError extends Error {
  constructor(
    message: string,
    public readonly key?: string
  ) {
    super(message);
    this.name = "AppEnvError";
  }
}
