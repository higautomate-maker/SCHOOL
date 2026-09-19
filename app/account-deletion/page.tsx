import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Account and Data Deletion | HIG School",
  description: "How to request deletion of an HIG School account and associated data.",
};

const supportEmail = "info@higautomation.com";
const deletionSubject = "HIG School account deletion request";

export default function AccountDeletionPage() {
  return <div className={styles.page}>
    <header className={styles.header}><div className={styles.headerInner}>
      <Link className={styles.brand} href="/"><span className={styles.mark}>H</span><span><strong>HIG School</strong><small>Secure school operations</small></span></Link>
      <nav aria-label="Legal pages"><Link href="/privacy">Privacy</Link><Link href="/account-deletion">Delete account or data</Link></nav>
    </div></header>

    <main className={styles.main}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Account controls</p>
        <h1>Request account and data deletion</h1>
        <p className={styles.intro}>School accounts are provisioned and managed by an authorised school or organisation. You can request deletion without reinstalling an app or signing in.</p>
        <div className={styles.meta}><span>HIGA Teacher</span><span>HIGA Parent &amp; Student</span><span>HIGA School Transport</span></div>
      </header>

      <div className={styles.grid}>
        <article className={styles.content}>
          <section>
            <h2>How to submit a request</h2>
            <ol>
              <li>First contact the school that created your account. Ask its authorised administrator to deactivate or delete the account and eligible school records.</li>
              <li>If you cannot reach the school, email <a href={`mailto:${supportEmail}?subject=${encodeURIComponent(deletionSubject)}`}>{supportEmail}</a> using your registered email address.</li>
              <li>Include the app name, school name, your role, registered email address or phone number, and whether you want the account deleted or only specific data removed. Do not send your password, payment credentials or identity documents unless our support team requests a secure verification step.</li>
              <li>We or the school will verify the request before changing records, to protect students and prevent unauthorised deletion.</li>
            </ol>
          </section>

          <section>
            <h2>What will be deleted</h2>
            <p>After a valid request is approved, the school or HIG School can deactivate the login and delete or de-identify eligible profile and app data associated with it, such as optional profile photos, active device sessions and records that are not required to be retained.</p>
            <h3>Records that may be retained</h3>
            <p>Some information may be retained where the school or HIG Automation has a legitimate operational, contractual, safety or legal need. Examples include attendance and academic records, fee ledgers and receipts, completed transport or safety events, audit and security history, backups awaiting normal expiry, and evidence required to resolve a dispute. Retained information remains protected and is not used for unrelated purposes.</p>
          </section>

          <section>
            <h2>Deleting specific data</h2>
            <p>You may request removal of eligible individual items—such as a profile photo—without deleting the entire account. Identify the exact item in your email. Some app permissions and locally stored app data can also be removed through your phone&apos;s settings or by uninstalling the app; uninstalling alone does not delete school records held on the server.</p>
          </section>

          <section>
            <h2>What happens next</h2>
            <p>We will acknowledge the request, identify the responsible school where applicable, and explain any verification or retention requirement. Completion time depends on the school&apos;s obligations and the type of record. You will receive a response at the contact address used for the request.</p>
            <p>Read the full <Link href="/privacy">HIG School Privacy Policy</Link> for more information about information handling and your choices.</p>
          </section>
        </article>

        <aside className={styles.aside}>
          <h2>Start a deletion request</h2>
          <p>Email from the address registered with your school. This helps us route and verify the request safely.</p>
          <a className={styles.button} href={`mailto:${supportEmail}?subject=${encodeURIComponent(deletionSubject)}`}>Email deletion support</a>
        </aside>
      </div>
    </main>

    <footer className={styles.footer}><div className={styles.footerInner}><span>© 2026 HIG Automation India Private Limited</span><span className={styles.footerLinks}><Link href="/privacy">Privacy</Link><Link href="/account-deletion">Account deletion</Link></span></div></footer>
  </div>;
}
