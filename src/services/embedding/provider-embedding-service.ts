import { EmbeddingGenerationError, LLMProviderAPIKeyError } from "@/lib/errors";
import { CloudflareEmbeddingService } from "./cloudflare-embedding-service";
import {
	type EmbeddingOptions,
	OpenAIEmbeddingService,
} from "./openai-embedding-service";

const TARGET_EMBEDDING_DIMENSIONS = OpenAIEmbeddingService.EXPECTED_DIMENSIONS;

function normalizeDimensions(values: number[]): number[] {
	if (values.length === TARGET_EMBEDDING_DIMENSIONS) {
		return values;
	}

	// Cloudflare BGE returns 768 dims; repeat to preserve shape/similarity.
	if (values.length === TARGET_EMBEDDING_DIMENSIONS / 2) {
		return [...values, ...values];
	}

	if (values.length > TARGET_EMBEDDING_DIMENSIONS) {
		return values.slice(0, TARGET_EMBEDDING_DIMENSIONS);
	}

	return [
		...values,
		...Array.from(
			{ length: TARGET_EMBEDDING_DIMENSIONS - values.length },
			() => 0
		),
	];
}

export class ProviderEmbeddingService {
	constructor(
		private readonly options: {
			openaiApiKey?: string;
			aiBinding?: any;
		}
	) {}

	async generateEmbedding(
		text: string,
		options?: EmbeddingOptions
	): Promise<number[]> {
		const embeddings = await this.generateEmbeddings([text], options);
		return embeddings[0];
	}

	async generateEmbeddings(
		texts: string[],
		options?: EmbeddingOptions
	): Promise<number[][]> {
		const openaiApiKey = this.options.openaiApiKey?.trim();
		if (openaiApiKey) {
			const openai = new OpenAIEmbeddingService(openaiApiKey);
			return openai.generateEmbeddings(texts, options);
		}

		if (this.options.aiBinding) {
			try {
				const cloudflare = new CloudflareEmbeddingService(
					this.options.aiBinding
				);
				const embeddings = await cloudflare.generateEmbeddings(texts);
				return embeddings.map(normalizeDimensions);
			} catch (error) {
				throw new EmbeddingGenerationError(
					error instanceof Error ? error.message : "Embedding provider failed"
				);
			}
		}

		throw new LLMProviderAPIKeyError(
			"No embedding provider configured. Set OPENAI_API_KEY or bind Cloudflare AI."
		);
	}
}
