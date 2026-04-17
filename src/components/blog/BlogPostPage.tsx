import { ArrowLeft } from "@phosphor-icons/react";
import { getPostBySlug } from "./blog-posts";

function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
	});
}

type Props = {
	slug: string;
};

export function BlogPostPage({ slug }: Props) {
	const post = getPostBySlug(slug);

	if (!post) {
		return (
			<div
				className="min-h-screen bg-neutral-50 dark:bg-neutral-950"
				style={{
					fontFamily:
						'"DM Sans", -apple-system, BlinkMacSystemFont, sans-serif',
				}}
			>
				<div className="relative max-w-3xl mx-auto px-6 py-14">
					<a
						href="/blog"
						className="inline-flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors mb-8"
					>
						<ArrowLeft size={18} weight="bold" />
						Back to blog
					</a>
					<h1 className="text-xl font-medium text-neutral-800 dark:text-neutral-100">
						Post not found
					</h1>
					<p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
						The blog post you're looking for doesn't exist or has been removed.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div
			className="min-h-screen bg-neutral-50 dark:bg-neutral-950"
			style={{
				fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, sans-serif',
			}}
		>
			<div
				className="pointer-events-none fixed inset-0 bg-gradient-to-b from-violet-50/30 via-transparent to-transparent dark:from-violet-950/10"
				aria-hidden
			/>

			<div className="relative max-w-3xl mx-auto px-6 py-10 sm:py-14">
				{/* Header */}
				<header className="flex items-center gap-4 mb-12 sm:mb-16">
					<a
						href="/blog"
						className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
					>
						<ArrowLeft size={18} weight="bold" />
						Back to blog
					</a>
					<span className="ml-auto text-sm font-medium text-neutral-500 dark:text-neutral-400">
						LoreSmith Blog
					</span>
				</header>

				{/* Article */}
				<article>
					<div className="flex flex-wrap items-baseline gap-2 text-xs text-neutral-500 dark:text-neutral-400 mb-4">
						<time dateTime={post.date}>{formatDate(post.date)}</time>
						<span aria-hidden>·</span>
						<span>{post.readTime}</span>
					</div>
					<h1 className="text-2xl sm:text-3xl font-medium text-neutral-800 dark:text-neutral-100 tracking-tight mb-8">
						{post.title}
					</h1>
					<div className="space-y-4 text-sm sm:text-base text-neutral-600 dark:text-neutral-400 leading-relaxed">
						{post.paragraphs.map(({ key: paragraphKey, text }) => (
							<p key={`${post.slug}-${paragraphKey}`}>{text}</p>
						))}
					</div>
				</article>

				{/* Footer */}
				<footer className="mt-16 pt-8 border-t border-neutral-200 dark:border-neutral-800">
					<a
						href="/blog"
						className="text-sm text-violet-700 dark:text-violet-400 hover:underline"
					>
						← Back to all posts
					</a>
					<div className="mt-4 text-center">
						<a
							href="/"
							className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-violet-700 dark:hover:text-violet-400 hover:underline"
						>
							Back to LoreSmith
						</a>
					</div>
				</footer>
			</div>
		</div>
	);
}
