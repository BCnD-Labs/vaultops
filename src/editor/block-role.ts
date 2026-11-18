import { Extension } from "@tiptap/core";

/**
 * Note conventions a block can carry as `attrs.role`: a heading marked
 * "inbox" is a brain-dump section, a block marked "flashcard" is a card whose
 * question and answer are split by a divider or `Q:`/`A:` lines.
 */
export const BLOCK_ROLES = ["inbox", "flashcard"] as const;
export type BlockRole = (typeof BLOCK_ROLES)[number];

/** The block types that can carry a role. */
export const ROLE_TYPES = [
	"heading",
	"paragraph",
	"listItem",
	"callout",
	"toggle",
] as const;

/** The role when it is one this version knows; any other value is kept but not shown. */
export function knownRole(value: unknown): BlockRole | undefined {
	return BLOCK_ROLES.find((role) => role === value);
}

/**
 * An optional `role` on the block types above. Any string is kept as it is
 * (a role from a newer version is not lost); only the known ones get the
 * `data-role` mark the editor styles. A block without a role has no `role` in
 * its saved attrs, because null is the attribute's default.
 */
export const BlockRole = Extension.create({
	name: "blockRole",
	addGlobalAttributes() {
		return [
			{
				types: [...ROLE_TYPES],
				attributes: {
					role: {
						default: null,
						parseHTML: (element) =>
							knownRole(element.getAttribute("data-role")) ?? null,
						renderHTML: (attributes) => {
							const role = knownRole(attributes.role);
							return role ? { "data-role": role } : {};
						},
					},
				},
			},
		];
	},
});
