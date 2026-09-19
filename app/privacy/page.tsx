import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Privacy Policy | HIG School",
  description: "How HIG School collects, uses, protects and shares information.",
};

const supportEmail = "info@higautomation.com";

export default function PrivacyPolicyPage() {
  return <div className={styles.page}>
    <LegalHeader />
    <main className={styles.main}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Trust and privacy</p>
        <h1>Privacy Policy</h1>
        <p className={styles.intro}>HIG School is a school operations platform provided by HIG Automation India Private Limited. This policy explains how information is handled across the HIG School web platform and the HIGA Teacher, HIGA Parent &amp; Student, and HIGA School Transport mobile apps.</p>
        <div className={styles.meta}><span>Effective 19 September 2026</span><span>Applies to all HIG School apps</span></div>
      </header>

      <div className={styles.grid}>
        <article className={styles.content}>
          <section>
            <h2>Who controls your information</h2>
            <p>Schools and authorised school organisations generally decide why student, parent, teacher, staff and transport information is used. HIG Automation India Private Limited provides and operates the HIG School service on their behalf. For company-platform administration, security and support information, HIG Automation India Private Limited may act as the responsible organisation.</p>
            <p>If your question concerns a school record, contact your school first. You can also contact us at <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
          </section>

          <section>
            <h2>Information we handle</h2>
            <ul>
              <li><strong>Account and identity:</strong> name, role, school, email address, phone number, login credentials, session and device identifiers.</li>
              <li><strong>School operations:</strong> class and subject assignments, student records, attendance, timetable, notices, leave requests, examinations, diary entries and homework.</li>
              <li><strong>Family and profile:</strong> parent-student relationships, authorised contact information and profile photos you choose to upload.</li>
              <li><strong>Fees and payments:</strong> invoices, balances, payment status, provider order or payment references, refunds and receipts. Payment-card or UPI credentials are entered in Razorpay&apos;s checkout and are not stored by HIG School.</li>
              <li><strong>Transport and safety:</strong> routes, stops, assigned riders, trip events, and the driver or vehicle&apos;s precise location while an authorised trip is active. Location can become outdated; the app shows freshness information and must not be used as an emergency service.</li>
              <li><strong>Security and diagnostics:</strong> privacy-protected network and user-agent fingerprints, audit history, error and performance information, and records needed to prevent misuse.</li>
            </ul>
          </section>

          <section>
            <h2>How information is used</h2>
            <ul>
              <li>Provide role-appropriate school services and keep school records accurate.</li>
              <li>Authenticate users, enforce school and tenant boundaries, and investigate security events.</li>
              <li>Deliver attendance, diary, fee, notice and transport experiences requested by the school.</li>
              <li>Process and reconcile payments, refunds and receipts when a school enables payments.</li>
              <li>Support users, maintain reliability, comply with lawful obligations and improve the service.</li>
            </ul>
            <p className={styles.note}>We do not sell personal information and do not use student information for targeted advertising.</p>
          </section>

          <section>
            <h2>When information is shared</h2>
            <p>Information is visible only to authorised school, company, teacher, parent, student or transport users according to their role and assignments. We may use carefully selected service providers for hosting, database infrastructure, payment processing, mapping, notifications, diagnostics and support. They receive only the information needed to provide their service and are subject to applicable agreements and safeguards.</p>
            <p>We may also disclose information when required by law, to protect people or the service, or as part of a corporate transaction with appropriate protections.</p>
          </section>

          <section>
            <h2>Children and school accounts</h2>
            <p>HIG School is intended for use under a school&apos;s administration. Student accounts and records are created or authorised by the school, not offered as an open consumer service. Schools are responsible for providing appropriate notices and obtaining permissions required for their community. Parents and guardians should contact their school about a child&apos;s record.</p>
          </section>

          <section>
            <h2>Retention and security</h2>
            <p>Records are kept only as long as needed for school operations, contractual, security, financial and legal purposes. Retention periods can differ by school and record type. When information is no longer required, it is deleted or de-identified through controlled processes.</p>
            <p>We use access controls, tenant isolation, encryption in transit, protected credentials, audit trails, backups and operational monitoring. No system is completely risk-free; please report suspected misuse promptly.</p>
          </section>

          <section>
            <h2>Your choices and requests</h2>
            <p>You may ask to access, correct or delete eligible information, withdraw an optional permission, or raise a privacy concern. Because most school records are controlled by the school, we may refer the request to the appropriate school administrator and verify your identity before acting.</p>
            <p>Mobile operating-system settings let you manage permissions such as location, notifications, camera or photos. Restricting a permission may prevent the related feature from working.</p>
            <p>For deletion instructions, visit our <Link href="/account-deletion">account and data deletion page</Link>.</p>
          </section>

          <section>
            <h2>Changes and contact</h2>
            <p>We may update this policy as the product, providers or legal requirements change. We will update the effective date and provide additional notice where appropriate.</p>
            <p><strong>HIG Automation India Private Limited</strong><br />Email: <a href={`mailto:${supportEmail}`}>{supportEmail}</a><br />India</p>
          </section>
        </article>

        <aside className={styles.aside}>
          <h2>Need help?</h2>
          <p>For a student or school record, contact your school administrator. For platform privacy and security questions, contact HIG Automation.</p>
          <a className={styles.button} href={`mailto:${supportEmail}?subject=HIG%20School%20privacy%20request`}>Email privacy support</a>
        </aside>
      </div>
    </main>
    <LegalFooter />
  </div>;
}

function LegalHeader() {
  return <header className={styles.header}><div className={styles.headerInner}>
    <Link className={styles.brand} href="/"><span className={styles.mark}>H</span><span><strong>HIG School</strong><small>Secure school operations</small></span></Link>
    <nav aria-label="Legal pages"><Link href="/privacy">Privacy</Link><Link href="/account-deletion">Delete account or data</Link></nav>
  </div></header>;
}

function LegalFooter() {
  return <footer className={styles.footer}><div className={styles.footerInner}><span>© 2026 HIG Automation India Private Limited</span><span className={styles.footerLinks}><Link href="/privacy">Privacy</Link><Link href="/account-deletion">Account deletion</Link></span></div></footer>;
}
