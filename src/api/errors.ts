/** An RFC 9457 problem document as returned by every app-backend endpoint. */
export type Problem = {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  errors?: Record<string, string[]>;
};

/** Machine readable `code` values the backend can return. */
export type ApiErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthorized"
  | "invalid_credentials"
  | "invalid_refresh_token"
  | "invalid_token"
  | "invalid_mfa_code"
  | "mfa_expired"
  | "email_in_use"
  | "email_not_confirmed"
  | "captcha_failed"
  | "plan_limit"
  | "rate_limited"
  | "not_found"
  | "conflict"
  | "network_error"
  | (string & {});

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fieldErrors: Record<string, string[]>;

  constructor(problem: Problem, fallbackStatus = 0) {
    super(problem.detail ?? problem.title ?? "Request failed.");
    this.name = "ApiError";
    this.status = problem.status ?? fallbackStatus;
    this.code = problem.code ?? "error";
    this.fieldErrors = problem.errors ?? {};
  }

  /** The first message for a field, if the server rejected it. */
  fieldError(field: string): string | undefined {
    return this.fieldErrors[field]?.[0];
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function isProblem(value: unknown): value is Problem {
  return typeof value === "object" && value !== null && ("code" in value || "title" in value || "detail" in value);
}

/**
 * Result shape of a hey-api SDK call when `throwOnError` is false.
 */
type SdkResult<TData, TError> =
  | { data: TData; error?: undefined; response: Response }
  | { data?: undefined; error: TError; response: Response };

/**
 * Turns an SDK result into its data, throwing an ApiError on failure:
 *
 *   const session = await unwrap(signIn({ body: { email, password } }));
 */
export async function unwrap<TData, TError>(
  call: PromiseLike<SdkResult<TData, TError>> | SdkResult<TData, TError>,
): Promise<NonNullable<TData>> {
  let result: SdkResult<TData, TError>;
  try {
    result = await call;
  } catch (cause) {
    if (isApiError(cause)) throw cause;
    throw new ApiError({ code: "network_error", detail: "Unable to reach the server. Check your connection." });
  }
  if (result.error !== undefined || !result.response.ok) {
    throw new ApiError(isProblem(result.error) ? result.error : { detail: "Request failed." }, result.response.status);
  }
  return result.data as NonNullable<TData>;
}
