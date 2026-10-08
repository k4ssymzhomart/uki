import { notFound } from "next/navigation";
import { AuditLogView } from "../../../features/privacy/audit-log-view.tsx";
import { PrivacyCentreView } from "../../../features/privacy/privacy-centre-view.tsx";
import { DEFAULT_AUDIT_FILTERS } from "../../../features/privacy/privacy-model.ts";
import {
  AUDIT_ENTRIES,
  CENTRE,
  DANA_ID,
  NOW_MS,
  YERLAN_DETAIL,
  ZHANSAYA_DETAIL,
} from "../../../features/privacy/test-fixtures.ts";
import { AppShell } from "../../../features/shell/app-shell.tsx";

const FRAMES = ["a5", "a5a", "a5b", "a6"] as const;
type Frame = (typeof FRAMES)[number];

/**
 * Development only: A.5, A.5a, A.5b and A.6 (`?frame=a5|a5a|a5b|a6`) with the component tests' fixture
 * rows, which follow the frames (Yerlan's delete, Zhansaya's copy, the frame's audit entries), inside the
 * shell as Dana sees it. For the side-by-side Figma comparisons without a database: nothing is read, and
 * the buttons are not meant to be pressed. The sidebar has no active item here, because the shell marks
 * the item of the address. The language comes from the `uki_locale` cookie.
 */
export default async function PrivacyGalleryPage({ searchParams }: PageProps<"/gallery/privacy">) {
  if (process.env.NODE_ENV === "production") notFound();
  const param = (await searchParams).frame;
  const frame: Frame = FRAMES.find((value) => value === param) ?? "a5";
  const detail = frame === "a5a" ? YERLAN_DETAIL : frame === "a5b" ? ZHANSAYA_DETAIL : null;
  return (
    <AppShell
      staff={{
        fullName: "Dana Akhmetova",
        email: "dana@kru.test",
        role: "exam_office",
        workspaceName: "KRU · Kostanay",
        facultyName: "Faculty of Mathematics",
      }}
      groupCodes={[]}
      nav={{ examsCount: 4, liveCount: 86, liveHref: "/overview", reviewCount: 7 }}
      facultyMenu={null}
    >
      {frame === "a6" ? (
        <AuditLogView
          entries={AUDIT_ENTRIES}
          truncated={false}
          filters={DEFAULT_AUDIT_FILTERS}
          me={DANA_ID}
          nowMs={NOW_MS}
        />
      ) : (
        <PrivacyCentreView data={CENTRE} detail={detail} missing={false} me={DANA_ID} nowMs={NOW_MS} />
      )}
    </AppShell>
  );
}
