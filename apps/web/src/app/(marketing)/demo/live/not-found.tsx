import { DemoLiveNotice } from "../../../../features/demo/demo-live-notice.tsx";

/** `/demo/live` when DEMO-LIVE does not exist yet or the signed-in account cannot see it. */
export default function DemoLiveNotFound() {
  return <DemoLiveNotice kind="missing" />;
}
