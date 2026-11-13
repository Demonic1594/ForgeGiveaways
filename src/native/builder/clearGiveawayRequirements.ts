import { NativeFunction } from "@tryforge/forgescript"

export default new NativeFunction({
    name: "$clearGiveawayRequirements",
    version: "2.1.0",
    description: "Removes every requirement from the giveaway being edited; requirement functions used after it start from scratch",
    unwrap: false,
    execute(ctx) {
        // $editGiveaway merges requirements into the existing ones, so each
        // one is set to its "nothing required" value rather than left out.
        ctx.requirements = {
            requiredRoles: [],
            requiredRolesMode: "all",
            restrictedRoles: [],
            restrictedMembers: [],
            minAccountAge: 0,
            minMemberAge: 0,
            excludeHost: false,
        }
        return this.success()
    }
})
