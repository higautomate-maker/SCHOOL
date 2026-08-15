import styles from "./auth-flow.module.css";

// Branded left panel shown on wide screens for the reset/invitation/forgot
// flows, giving the same two-panel look as /login. Hidden on mobile via CSS so
// those screens collapse to a single compact card.
export default function AuthBrandPanel() {
  return (
    <aside className={styles.brandPanel} aria-hidden="true">
      <div className={styles.brand}><i>H</i><span><b>HIG School</b><small>HIG AUTOMATION INDIA PRIVATE LIMITED</small></span></div>
      <div className={styles.promise}>
        <span>SECURE SCHOOL ECOSYSTEM</span>
        <h1>One trusted workspace for every school role.</h1>
        <p>Your school and role permissions are resolved securely. We never confirm whether an account exists.</p>
        <div className={styles.trust}>
          <article><b>Tenant isolated</b><small>Each school stays securely separated.</small></article>
          <article><b>Role controlled</b><small>Users see only approved modules.</small></article>
          <article><b>Audited changes</b><small>Critical access actions are recorded.</small></article>
        </div>
      </div>
      <footer className={styles.brandFoot}>HIG School OS · India-region tenant workspace</footer>
    </aside>
  );
}
