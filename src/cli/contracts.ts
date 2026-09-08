export interface RunOptions {
	stdin?: string;
	signal?: AbortSignal;
	timeoutMs?: number;
}

export interface CliSuccessEnvelope<T> {
	success: true;
	code: string;
	message: string;
	schema_version: string;
	status: "completed" | "action_required";
	retryable: boolean;
	data: T;
}

export interface CliFailureEnvelope {
	success: false;
	code: string;
	message: string;
	schema_version: string;
	status: "failed";
	retryable: boolean;
	error?: string;
	error_details?: Record<string, unknown>;
	next_actions?: string[];
}

export type CliEnvelope<T> = CliSuccessEnvelope<T> | CliFailureEnvelope;

export interface CliRunner {
	run<T>(
		args: readonly string[],
		options?: RunOptions,
	): Promise<CliEnvelope<T>>;
}
