export type WorkerRouteHandler = () => Promise<Response | null>;

export async function runWorkerRouteHandlers(
  handlers: readonly WorkerRouteHandler[],
): Promise<Response | null> {
  for (const handler of handlers) {
    const response = await handler();
    if (response) {
      return response;
    }
  }
  return null;
}
