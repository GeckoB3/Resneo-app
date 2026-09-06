/**
 * Every user-facing string of Ask ResNeo, in one place — the app's copy of the
 * web's `src/lib/assistant/copy.ts`, with the strings that name a web surface
 * (the sidebar launcher, the support card on /dashboard/support) dropped and
 * the rest kept verbatim so both clients say the same thing.
 *
 * Never an em-dash: this is copy a user reads, and the web keeps the same rule
 * because the model copies the style it is shown.
 */
export const ASSISTANT_COPY = {
  launcher: 'Ask ResNeo',
  launcherHint: 'Instant answers from the help centre',
  title: 'Ask ResNeo',
  description: "Answers come from the ResNeo help centre. Please don't include client details.",
  placeholder: 'Ask how to do something in ResNeo',
  send: 'Send',
  stop: 'Stop',
  thinking: 'Finding the answer',
  newConversation: 'Start again',
  disclaimer: 'Ask ResNeo can make mistakes. Check the linked article for the full steps.',
  feedbackPrompt: 'Was this helpful?',
  feedbackYes: 'Yes',
  feedbackNo: 'No',
  feedbackCommentPlaceholder: 'What was missing or wrong? (optional)',
  feedbackCommentSend: 'Send feedback',
  feedbackThanks: 'Thanks, that helps us improve the help centre.',
  sendToSupport: 'Send this to support',
  handoffSubject: 'Question from Ask ResNeo',
  stopped: 'Stopped before the answer finished.',
  stoppedEmpty: 'Stopped before an answer arrived.',
  rateLimited:
    "You've asked a lot of questions in a short time. Please try again in a few minutes, or use the Support form.",
  dailyCap:
    "This venue has reached today's limit for Ask ResNeo. It resets at midnight. The Support form is always available.",
  error: 'Something went wrong while answering. Please try again, or send your question to Support.',
  unavailable: 'Ask ResNeo is not available right now. The Support form is always available.',
  emptyTitle: 'Ask how to do something in ResNeo',
  emptyBody:
    'Answers come from the ResNeo help centre, including the articles about this app. Ask about a screen, a setting or a job you are trying to finish.',
} as const;
