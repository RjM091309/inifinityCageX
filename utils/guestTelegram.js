/**
 * Per-guest Telegram notification enable flag (guest.TELEGRAM_ENABLED).
 * When disabled, TELEGRAM_ID is kept but outbound messages are skipped.
 */

function isGuestTelegramEnabled(guestRow) {
	if (!guestRow) return false;
	const id = guestRow.TELEGRAM_ID ?? guestRow.telegram_id ?? guestRow.guest_telegram;
	if (id == null || String(id).trim() === '') return false;
	const enabled = guestRow.TELEGRAM_ENABLED ?? guestRow.telegram_enabled;
	if (enabled === 0 || enabled === false || enabled === '0') return false;
	return true;
}

function getGuestTelegramChatId(guestRow) {
	if (!isGuestTelegramEnabled(guestRow)) return null;
	const id = guestRow.TELEGRAM_ID ?? guestRow.telegram_id ?? guestRow.guest_telegram;
	return String(id).trim();
}

module.exports = {
	isGuestTelegramEnabled,
	getGuestTelegramChatId
};
