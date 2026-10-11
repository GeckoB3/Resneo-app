import { fillCopy, POS_COPY, type CopyVars } from '@/lib/pos/copy';

/**
 * The words of "Add products with AI" in the app (POS test round 2026-10-11, Part 4, OB7; design
 * section 6.7 and mock-up B9).
 *
 * - `AI_COPY`: keys in the web's form are word for word the web's deck
 *   (`src/components/retail/ai-import/copy.ts`), so the two never drift. `app.ai.*` are the app's
 *   own: the camera's second photo, the lines where the web speaks of dragging, pasting or a window,
 *   the checks the phone makes before sending, and the camera permission.
 * - `AI_REVIEW`: the review notes, word for word the server's `PRODUCT_AI_REVIEW`
 *   (`src/lib/retail/ai-import/messages.ts`). They must stay identical: the app recomputes the notes
 *   as the owner edits, and tells the server's flags (a possible trade price, a guess that it is for
 *   treatments) and its own notes apart from the reader's by these exact sentences.
 *
 * Rules `copy.test.ts` enforces: no em-dash anywhere, straight apostrophes, no currency symbol next
 * to a money placeholder (money arrives formatted), no country or competitor named, every
 * placeholder filled by its caller. A count of one uses the `<id>.one` wording.
 */
export const AI_COPY = {
  'ai.entry': 'Add with AI',
  'ai.title': 'Add products with AI',
  'ai.desc.sources': "Show us what you sell, and we'll read the products and prices for you to check.",
  'ai.desc.reading': 'Reading what you gave us. This usually takes under a minute.',
  'ai.desc.review': 'Check each product, then add it. Nothing is added until you say so.',
  'ai.desc.done': 'All done.',

  'ai.src.intro':
    'Show us your products however you have them. We read them, then you check each one before anything is added. You can add more than one.',
  'ai.src.photos.title': 'Photos',
  'ai.src.photos.body': 'Your shelves, the products themselves, or a printed price list.',
  'ai.src.file.title': 'A price list or invoice',
  'ai.src.file.body': 'A PDF, Excel, CSV or Word file, for example from your supplier.',
  'ai.src.link.title': 'A link',
  'ai.src.link.body': "Your own web shop, or a supplier's page with your products.",
  'ai.src.text.title': 'Type or paste a list',
  'ai.src.text.body': 'One product per line is fine. Add sizes and prices if you know them.',
  'ai.src.photos.choose': 'Choose photos',
  'ai.src.photos.take': 'Take a photo',
  'ai.src.file.choose': 'Choose a file',
  'ai.src.link.label': 'Link to your products',
  'ai.src.link.add': 'Add link',
  'ai.src.link.help': "If a site won't let us read it, a screenshot of the products works just as well.",
  'ai.src.text.label': 'Your products',
  'ai.src.text.placeholder': 'Repair Shampoo 250 ml £18.50\nRepair Shampoo 1 litre £42\nSea Salt Spray £16',
  'ai.src.text.add': 'Add this list',
  'ai.src.preparing': 'Getting your photos ready…',
  'ai.src.list': "What we'll read ({count})",
  'ai.src.remove': 'Remove',
  'ai.src.removeLabel': 'Remove {label}',
  'ai.src.lastTry': 'Last try: {error}',
  'ai.src.typed': 'Your typed list',
  'ai.src.typedN': 'Your typed list {n}',
  'ai.src.max': 'You can add up to {count} things at a time. Read these first, then add the rest.',
  'ai.src.tooBig': "{names} are over {size} MB, so we can't send them. Try a photo or a screenshot instead.",
  'ai.src.tooBig.one': "{names} is over {size} MB, so we can't send it. Try a photo or a screenshot instead.",
  'ai.src.cutShort': '{names} are very long, so we read the top part. Add a second screenshot of the rest.',
  'ai.src.cutShort.one': '{names} is very long, so we read the top part. Add a second screenshot of the rest.',
  'ai.src.unreadable': "{names} couldn't be opened. Save them as JPG or take screenshots, then try again.",
  'ai.src.unreadable.one': "{names} couldn't be opened. Save it as a JPG or take a screenshot, then try again.",
  'ai.src.fileUnreadable': "{names} couldn't be opened. Check the files and try again.",
  'ai.src.fileUnreadable.one': "{names} couldn't be opened. Check the file and try again.",
  'ai.disclosure':
    'We use AI (from OpenAI) to read what you add. Please do not include client names or other personal details. Nothing is added to your products until you choose to add it.',

  'ai.cancel': 'Cancel',
  'ai.back': 'Back',
  'ai.find': 'Find my products',
  'ai.findN': 'Find my products in these {count}',
  'ai.tryAgain': 'Try again',
  'ai.retry': 'Retry',
  'ai.read.waiting': 'Waiting',
  'ai.read.reading': 'Reading…',
  'ai.read.found': 'Found {count} products',
  'ai.read.found.one': 'Found 1 product',
  'ai.read.foundPlus': 'Found {count} products, plus {listed} already on your list',
  'ai.read.foundPlus.one': 'Found 1 product, plus {listed} already on your list',
  'ai.read.foundOnly': "Found {count} products you'd already added from somewhere else",
  'ai.read.foundOnly.one': "Found 1 product you'd already added from somewhere else",
  'ai.read.noneFound':
    "We couldn't get any products from that. Go back and try a photo of your price list, or type your products in.",
  'ai.read.check': 'Check {count} products',
  'ai.read.check.one': 'Check 1 product',
  'ai.read.checkNone': 'Check your products',

  'ai.err.network': "We couldn't reach ResNeo. Check your connection and try again.",
  'ai.err.tooBig': "That's too big to send. Try fewer photos at a time, or a smaller file.",
  'ai.err.timeout': 'That took too long to read. Try a shorter list, or fewer photos at a time.',
  'ai.err.generic': "We couldn't read that just now. Please try again.",

  'ai.review.found': '{count} products found.',
  'ai.review.found.one': '1 product found.',
  'ai.review.progress': '{added} added, {skipped} skipped, {pending} still to check.',
  'ai.review.more': 'Add more from another source',
  'ai.review.noticed': 'Things we noticed while reading',
  'ai.review.filter.all': 'All ({count})',
  'ai.review.filter.pending': 'To check ({count})',
  'ai.review.filter.added': 'Added ({count})',
  'ai.review.filter.skipped': 'Skipped ({count})',
  'ai.review.nothingLeft': 'Nothing left to check.',
  'ai.review.nothing': 'Nothing here yet.',
  'ai.addAll': 'Add all ready ({count})',
  'ai.adding': 'Adding {done} of {total}…',
  'ai.finish': 'Finish',
  'ai.finishLater': 'Finish for now',
  'ai.addAll.title': 'Add {count} products?',
  'ai.addAll.title.one': 'Add 1 product?',
  'ai.addAll.body':
    'This adds every product that is ready. Products that need a check stay here for you, and you can change any product afterwards.',
  'ai.addAll.confirm': 'Add {count} products',
  'ai.addAll.confirm.one': 'Add 1 product',
  'ai.bulk.stopped':
    "Several products in a row couldn't be added, so we stopped. Check the messages on them, then try again.",
  'ai.leave.title': 'Leave without adding the rest?',
  'ai.leave.body':
    "{count} products are still waiting to be checked, and they won't be kept. Products you've added stay on your list.",
  'ai.leave.body.one':
    "1 product is still waiting to be checked, and it won't be kept. Products you've added stay on your list.",
  'ai.leave.confirm': 'Leave',
  'ai.leave.cancel': 'Keep checking',

  'ai.card.unnamed': 'Unnamed product',
  'ai.card.ready': 'Ready',
  'ai.card.check': 'Check',
  'ai.card.fix': 'Fix',
  'ai.card.add': 'Add product',
  'ai.card.addNew': 'Add as a new product',
  'ai.card.skip': 'Skip',
  'ai.card.edit': 'Edit',
  'ai.card.doneEditing': 'Done editing',
  'ai.card.restore': 'Bring back',
  'ai.card.skipped': "Skipped, it won't be added",
  'ai.card.added': 'Added',
  'ai.card.options': '{count} options',
  'ai.card.from': 'from {price}',
  'ai.card.noPrice': 'No price',
  'ai.card.priceFix': 'Price needs fixing',
  'ai.card.backbar': 'For treatments only',
  'ai.edit.name': 'Product name',
  'ai.edit.brand': 'Brand',
  'ai.edit.category': 'Category',
  'ai.edit.use': 'How you use it',
  'ai.edit.options': 'Sizes or shades',
  'ai.edit.option': 'Size or shade',
  'ai.edit.optionPlaceholder': 'For example 250 ml',
  'ai.edit.price': 'Price',
  'ai.edit.cost': 'Cost',
  'ai.edit.barcode': 'Barcode',
  'ai.edit.optionField': '{option}: {field}',
  'ai.edit.addOption': 'Add a size or shade',
  'ai.edit.removeOption': 'Remove {option}',
  'ai.edit.costHelp': 'Cost is what you pay for one. It helps you see your margin, and you can leave it blank.',
  'ai.add.failed': "This product couldn't be added. Please try again.",
  'ai.add.brandFailed': "We couldn't add the brand {name}. Clear the brand and try again.",
  'ai.add.categoryFailed': "We couldn't add the category {name}. Clear the category and try again.",
  'ai.add.unclear': 'This product may have been added. Close this and check your products before trying again.',

  'ai.done.title': 'Done: {count} products added',
  'ai.done.title.one': 'Done: 1 product added',
  'ai.done.none': 'Nothing added this time',
  'ai.done.pending': "{count} products weren't added this time. You can add them whenever you're ready.",
  'ai.done.pending.one': "1 product wasn't added this time. You can add it whenever you're ready.",
  'ai.done.body': 'You can change any of them on your products list, including photos, prices and stock.',
  'ai.done.again': "You can come back and add products whenever you're ready.",
  'ai.done.more': 'Add more products',
  'ai.done.close': 'Done',
  'ai.toast.added': '{count} products added.',
  'ai.toast.added.one': '1 product added.',

  // The app's own (app).
  'app.ai.src.photos.another': 'Take another photo',
  // The web's help also offers dragging and pasting, which a phone does not.
  'app.ai.src.photos.help': 'Get close enough to read the labels and price tags, and make sure nothing is cut off.',
  'app.ai.src.file.help': 'PDF, Excel, CSV or Word, up to {size} MB each.',
  'app.ai.src.file.type': 'Choose a PDF, Excel (.xlsx), CSV or Word (.docx) file.',
  'app.ai.src.link.placeholder': 'www.yoursalon.com/shop',
  'app.ai.src.link.invalid': "That doesn't look like a web address. Check it and try again.",
  'app.ai.src.text.tooLong': 'That list is too long to read in one go. Split it into two and add each one.',
  'app.ai.photo': 'Photo {n}',
  'app.ai.camera.denied':
    "ResNeo can't use your camera. Turn on camera access for ResNeo in your phone's settings, or choose photos instead.",
  'app.ai.camera.settings': 'Open settings',
  'app.ai.camera.failed': "Your camera didn't open. Please try again, or choose photos instead.",
  'app.ai.library.failed': "Your photos couldn't be opened. Please try again.",
  'app.ai.read.keepOpen': 'A long list can take a minute or two. Please keep this screen open.',
  // The server's `unavailable` sentence, for when the reader isn't offered here.
  'app.ai.unavailable':
    "Adding products with AI isn't available right now. You can still add products yourself, or import a spreadsheet.",
  'app.ai.use.retail': POS_COPY['prod.use.retail'],
  'app.ai.use.backbar': POS_COPY['prod.use.professional'],
  'app.ai.use.both': POS_COPY['prod.use.both'],
} as const;

/** The review notes: word for word the server's `PRODUCT_AI_REVIEW`. */
export const AI_REVIEW = {
  nameMissing: 'Give this product a name.',
  priceMissing: "Add the price you sell it for. Without a price it can't go on the till.",
  priceMissingOption: '{option}: add the price you sell it for.',
  priceInvalid: "The price isn't a number. Use something like 18 or 18.50.",
  priceInvalidOption: "{option}: the price isn't a number. Use something like 18 or 18.50.",
  costInvalid: "The cost isn't a number. Use something like 9 or 9.25, or leave it blank.",
  costInvalidOption: "{option}: the cost isn't a number. Use something like 9 or 9.25, or leave it blank.",
  optionNameMissing: 'Option {n} needs a name, like a size or shade.',
  optionNameRepeated: 'Two options are called {name}. Give each its own name.',
  barcodeInvalidOption: '{option}: {problem}',
  barcodeRepeated: 'Two options have the barcode {barcode}. Each needs its own.',
  priceMaybeTrade: "This price may be what you pay your supplier. Check it's the price you sell it for.",
  usageGuess: 'This looks like something you use in treatments, so we set it to For treatments only. Change it if you sell it.',
  duplicate: 'This looks like a product you already have. Adding it makes a second one.',
  costAbovePrice: 'The cost is more than the price. Check both.',
  costAbovePriceOption: '{option}: the cost is more than the price. Check both.',
  barcodeDropped: "We couldn't read the barcode clearly, so we left it out. You can scan it in later.",
  barcodeDroppedOption: "{option}: we couldn't read the barcode clearly, so we left it out. You can scan it in later.",
  optionLabel: 'Option {n}',
} as const;

export type AiCopyId = keyof typeof AI_COPY;

/** One string, filled. */
export function aiT(id: AiCopyId, vars: CopyVars = {}): string {
  return fillCopy(AI_COPY[id], vars);
}

/** The `.one` form when `count` is 1 and the deck has one; `{count}` is filled either way. */
export function aiCount(id: AiCopyId, count: number, vars: CopyVars = {}): string {
  const one = `${id}.one`;
  const template = count === 1 && one in AI_COPY ? AI_COPY[one as AiCopyId] : AI_COPY[id];
  return fillCopy(template, { count, ...vars });
}

/** A review sentence, filled. */
export function reviewText(id: keyof typeof AI_REVIEW, vars: CopyVars = {}): string {
  return fillCopy(AI_REVIEW[id], vars);
}
