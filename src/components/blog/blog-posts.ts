export type BlogParagraph = {
	key: string;
	text: string;
};

export type BlogPost = {
	slug: string;
	title: string;
	excerpt: string;
	date: string;
	readTime: string;
	paragraphs: BlogParagraph[];
};

export const BLOG_POSTS: BlogPost[] = [
	{
		slug: "when-we-actually-commit-code",
		title: "When we actually commit code",
		excerpt:
			"Spoiler: it's mostly after 10pm. A look at our commit times over the past year.",
		date: "2026-03-10",
		readTime: "3 min read",
		paragraphs: [
			{
				key: "night-owls",
				text: "We ran the numbers on our git history. Turns out we're night owls.",
			},
			{
				key: "busiest-hours",
				text: "The busiest hours are 10pm, midnight, and 11pm. In that order. Something like 37 commits at 10pm, 32 at midnight, 31 at 11pm. The afternoon has a little bump around 1pm and 2pm but nothing like the late-night surge.",
			},
			{
				key: "makes-sense",
				text: "Makes sense. Day job, dinner, maybe a walk. Then you sit down and the code actually gets written. Or you're fixing that one bug before bed and it turns into three hours. We've all been there.",
			},
			{
				key: "by-day",
				text: "Saturday is the slowest day. Only 26 commits across the whole repo. Sunday picks up. Wednesday is the real workhorse at 94 commits. No idea why Wednesday. Maybe it's the hump day energy.",
			},
		],
	},
	{
		slug: "our-most-prolific-days",
		title: "Our most prolific days",
		excerpt:
			"Feb 25 2026 had 26 commits. Aug 13 2025 had 19. Here's what that looks like.",
		date: "2026-03-08",
		readTime: "4 min read",
		paragraphs: [
			{
				key: "big-days",
				text: "Some days you just ship. Feb 25 2026 we had 26 commits. Aug 13 2025 we had 19. March 10 2026 (today, when we're writing this) we're already at 15.",
			},
			{
				key: "what-they-are",
				text: "Those big days are usually refactors or feature sprints. Splitting a giant file into smaller ones. Adding test coverage. The kind of work where you commit often because you're moving fast and you want checkpoints.",
			},
			{
				key: "by-month",
				text: "By month, February 2026 was huge with 88 commits. July and August 2025 were also heavy at 66 and 64. December 2025 had 38. The summer and late winter seem to be when things get built.",
			},
			{
				key: "no-plan",
				text: "We don't plan these. They just happen when the work lines up and the coffee holds out.",
			},
		],
	},
	{
		slug: "ani-vs-oren-different-strokes",
		title: "Ani vs Oren: different strokes",
		excerpt:
			"Two main contributors, two different rhythms. What the commit history says about how we work.",
		date: "2026-03-05",
		readTime: "4 min read",
		paragraphs: [
			{
				key: "counts",
				text: "Oren has 288 commits. Ani has about 140 (the name shows up a few ways in git). The ratio is roughly 2 to 1. But the style is different.",
			},
			{
				key: "hours",
				text: "Oren commits at all hours. Midnight is his peak with 25 commits. Then 11pm, 10pm, 2pm. He's got a spread. Ani tends toward evening too—10pm is her top hour with 13—but she also has a decent 1pm showing. Maybe lunch break coding.",
			},
			{
				key: "weekdays",
				text: "By day of week, Oren loves Wednesday. 66 commits. Ani spreads more evenly across Tuesday and Monday (16 each), then Thursday (14). She barely touches Saturday. Three commits total. Oren has 22 on Saturday. Different weekend habits.",
			},
			{
				key: "lines",
				text: "Line counts are wild. Oren's added something like 400k lines over time (a lot of that is package-lock and generated stuff, to be fair). Ani's at about 16k added. She does smaller, focused changes. He does the big refactors and new systems. Both approaches work. The repo wouldn't be what it is without either.",
			},
		],
	},
];

export function getPostBySlug(slug: string): BlogPost | undefined {
	return BLOG_POSTS.find((p) => p.slug === slug);
}
