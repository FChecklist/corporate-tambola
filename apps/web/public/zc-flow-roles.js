/* Corporate Tambola only (?flow=new): who lets whom in. Pure rules from the owner's note 29, written once and used for the words on every role's screen.
   The engine decides the real outcome; Hosts, Co-host approval and family approval that it cannot do yet are not drawn (see handover 194). */
(() => {
  const FAMILY_CUTOFF_MIN = 15;
  /** The people who may let someone in, by the link that person used. */
  const approvers = (link) => (link === "family" ? ["family host"] : link === "cohost" ? ["Co-host", "Host", "organizer"] : ["Host", "organizer"]);
  /**
   * What happens when a person opens the game link.
   * sc: link (open | listed | family | cohost | host), validation (system | manual), onList, family (card 2 on), pay (pending | paid | free), minutesToStart, capFull.
   * Returns { outcome: in | waiting | not_open | full | refused, approvers: [] }.
   */
  function decide(sc) {
    if (sc.pay === "pending") return { outcome: "not_open", approvers: [] };
    if (sc.capFull) return { outcome: "full", approvers: [] };
    if (sc.link === "family") {
      if (!sc.family) return { outcome: "refused", approvers: [] };                 // no family passes in this game
      if (sc.minutesToStart < FAMILY_CUTOFF_MIN) return { outcome: "refused", approvers: [] }; // the family host approves up to 15 minutes before the start
      return { outcome: "waiting", approvers: approvers("family") };
    }
    if (sc.link === "open") return { outcome: "in", approvers: [] };                // anyone can join: name, mobile, email; no approval
    if (sc.validation === "system" && sc.onList) return { outcome: "in", approvers: [] };
    return { outcome: "waiting", approvers: approvers(sc.link === "cohost" ? "cohost" : "host") };
  }
  /** The plain sentence a role reads about who lets people in. */
  function approvalText(role) {
    return role === "cohost" ? "People who join with your link wait for you. You, a Host or the organizer can let them in."
      : role === "host" ? "People who join with the game link, a Host link or the organizer link wait for you or the organizer. People who join with a Co-host link can also be let in by that Co-host."
      : "People who join with the game link wait for you or a Host. People who join with a Co-host link can also be let in by that Co-host. A family host approves their own family.";
  }
  window.ZROLES = { FAMILY_CUTOFF_MIN, approvers, decide, approvalText };
})();
