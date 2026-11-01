/**
 * A part that names a county rather than a town, so a typed "17 King St, Winterton, North
 * Lincolnshire, DN15 9TP" reads Winterton as its town. Only unambiguous names: Down, Antrim and
 * Durham are towns too, so they count only as "County Down" or "Co. Down".
 */
const COUNTY_PART =
  /^(?:(?:county|co\.?)\s+.+|.*shire|kent|essex|surrey|(?:east |west )?sussex|norfolk|suffolk|devon|cornwall|dorset|somerset|cumbria|merseyside|tyne (?:and|&) wear|greater (?:london|manchester)|west midlands|rutland|northumberland)$/i;

/**
 * Split combined venue.address (comma-separated) into fields used in venue-profile editing.
 * Ported from the web's src/lib/venue/address-format.ts.
 * Must stay in sync with how {@link buildAddress} joins them.
 *
 * Read by POSITION, never by what a postcode looks like: venues are not only in
 * the UK, and a French "75001" or a US "10118" is as much a postcode as
 * "BT1 1AA". The joined form is "name, street, town, postcode" with the name
 * optional, so from the end: the last of three or more parts is the postcode when
 * it has a digit in it, then comes the town (a county before it is passed over and
 * dropped), and what is left is the street. A first part that starts with a number
 * is part of the street, otherwise it is the building's name when anything else is left.
 */
export function parseAddress(address: string | null | undefined): {
  name: string;
  street: string;
  town: string;
  postcode: string;
} {
  if (!address) return { name: '', street: '', town: '', postcode: '' };
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { name: '', street: address.trim(), town: '', postcode: '' };
  if (parts.length === 1) return { name: '', street: parts[0]!, town: '', postcode: '' };
  const postcode = parts.length >= 3 && /\d/.test(parts[parts.length - 1]!) ? parts.pop()! : '';
  let town = parts.pop()!;
  if (parts.length >= 2 && COUNTY_PART.test(town)) town = parts.pop()!;
  if (parts.length >= 2 && !/^\d/.test(parts[0]!)) {
    const name = parts.shift()!;
    return { name, street: parts.join(', '), town, postcode };
  }
  return { name: '', street: parts.join(', '), town, postcode };
}

/**
 * The building name to show for editing. A blank one is filled with the business name when saved, so
 * one that reads the same is shown blank again, or a rename would leave the old name in the address.
 */
export function buildingNameField(address: string | null | undefined, businessName: string | null | undefined): string {
  const name = parseAddress(address).name;
  return name.trim().toLowerCase() === (businessName ?? '').trim().toLowerCase() ? '' : name;
}

/** Join structured address fields into venues.address (same comma-separated format as the web). */
export function buildAddress(fields: { name: string; street: string; town: string; postcode: string }): string {
  return [fields.name, fields.street, fields.town, fields.postcode]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
}
