// Development gallery: every Controls component in every variant and state, next to its Figma
// screenshot. Sample strings are the Figma defaults; this file is not product UI.
// Hover, Pressed and Focus are shown with the same classes the CSS states apply.
import { type ReactNode, useState } from "react";
import { assetUrl } from "../art/asset-url.ts";
import { cn } from "../cn.ts";
import { floatingListClasses } from "../feedback/menu-content.tsx";
import { menuItemVariants } from "../feedback/menu-item.tsx";
import { Icon } from "../icon.tsx";
import { iconNames } from "../icons.ts";
import { SearchField } from "../shell/search-field.tsx";
import { Button, type ButtonVariant } from "./button.tsx";
import { Checkbox } from "./checkbox.tsx";
import figmaIcons from "./figma/1-63.png";
import figmaButton from "./figma/8-37.png";
import figmaToggle from "./figma/15-1314.png";
import figmaSearch from "./figma/45-2054.png";
import figmaIconButton from "./figma/45-2059.png";
import figmaCheckbox from "./figma/49-2176.png";
import figmaRadio from "./figma/49-2188.png";
import figmaSelect from "./figma/79-2410.png";
import figmaInput from "./figma/142-13172.png";
import figmaTextArea from "./figma/143-13134.png";
import { IconButton } from "./icon-button.tsx";
import { Input } from "./input.tsx";
import { RadioGroup } from "./radio-group.tsx";
import { RadioOption } from "./radio-option.tsx";
import { Select } from "./select.tsx";
import { SelectItem } from "./select-item.tsx";
import { TextArea } from "./text-area.tsx";
import { Toggle } from "./toggle.tsx";

export const title = "Controls";
export const order = 1;

function Pair({ name, figma, children }: { name: string; figma: string; children: ReactNode }) {
  return (
    <div className="mb-12 grid grid-cols-2 items-start gap-8">
      <div>
        <h3 className="mb-4 type-ui-label">{name} · code</h3>
        {children}
      </div>
      <div>
        <h3 className="mb-4 type-ui-label">{name} · Figma</h3>
        <img src={assetUrl(figma)} alt="" className="max-w-full" />
      </div>
    </div>
  );
}

const VARIANTS: ButtonVariant[] = ["primary", "brand", "secondary", "ghost", "danger"];

const FORCED: Record<ButtonVariant, { hover: string; pressed: string }> = {
  primary: { hover: "bg-inverse-hover", pressed: "bg-inverse-pressed" },
  brand: { hover: "bg-brand-hover", pressed: "bg-brand-pressed" },
  secondary: { hover: "bg-hover", pressed: "bg-pressed" },
  ghost: { hover: "bg-hover", pressed: "bg-pressed" },
  danger: { hover: "bg-danger-hover", pressed: "bg-danger-pressed" },
};

const FOCUS = "shadow-focus inset-ring-2 inset-ring-line-focus";

function ButtonGrid() {
  const [clicks, setClicks] = useState(0);
  return (
    <div className="flex flex-col gap-4 rounded-md bg-canvas p-6">
      {(["default", "hover", "pressed", "focus", "loading"] as const).map((state) => (
        <div key={state} className="flex flex-wrap items-center gap-4">
          {VARIANTS.map((variant) => (
            <Button
              key={variant}
              variant={variant}
              loading={state === "loading"}
              className={cn(
                state === "hover" && FORCED[variant].hover,
                state === "pressed" && FORCED[variant].pressed,
                state === "focus" && FOCUS,
              )}
              onClick={() => setClicks((count) => count + 1)}
            >
              Start exam
            </Button>
          ))}
          {state === "default" ? <Button disabled>Start exam</Button> : null}
          <span className="type-ui-mono opacity-58">{state}</span>
        </div>
      ))}
      <p className="type-ui-mono opacity-58">clicks: {clicks}</p>
    </div>
  );
}

function SelectOpenMock() {
  // Static copy of the open list: Radix Select is modal while open, so the gallery draws it with the same classes.
  const options = [
    { label: "Қазақша", meta: "ҚАЗ", state: "checked" },
    { label: "Русский", meta: "РУС", state: "highlighted" },
    { label: "English", meta: "ENG", state: "" },
  ];
  return (
    <div className="relative flex w-80 flex-col gap-1.5">
      <span className="type-label-m opacity-70">Rules language</span>
      <div className="flex w-full items-center gap-2.5 rounded-sm bg-surface py-2.75 pr-3 pl-3.5 inset-ring-2 inset-ring-line-strong">
        <Icon name="globe" className="size-4.5" />
        <span className="flex-1 type-label-m">Қазақша</span>
        <Icon name="chevron-down" className="size-4.5 rotate-180" />
      </div>
      <div className={cn(floatingListClasses, "absolute top-full left-0 mt-4 w-full")}>
        {options.map((option) => (
          <div
            key={option.label}
            className={menuItemVariants()}
            data-state={option.state === "checked" ? "checked" : undefined}
            data-highlighted={option.state === "highlighted" ? "" : undefined}
          >
            <Icon name="globe" className="size-4.5" />
            <span className="flex-1 type-label-m">{option.label}</span>
            <span className="type-ui-mono opacity-50">{option.meta}</span>
            {option.state === "checked" ? <Icon name="check" className="size-4" /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ControlsGallery() {
  const [language, setLanguage] = useState("kk");
  const [toggle, setToggle] = useState(true);
  const [decision, setDecision] = useState("none");
  return (
    <div>
      <Pair name="Icons 1:63 (icons.ts, Lucide)" figma={figmaIcons}>
        <div className="grid w-150 grid-cols-9 gap-y-6">
          {iconNames.map((name) => (
            <div key={name} className="flex flex-col items-center gap-1" title={name}>
              <Icon name={name} />
              <span className="type-ui-mono opacity-50">{name.slice(0, 9)}</span>
            </div>
          ))}
        </div>
      </Pair>

      <Pair name="Button 8:37" figma={figmaButton}>
        <ButtonGrid />
      </Pair>

      <Pair name="Icon button 45:2059" figma={figmaIconButton}>
        <div className="flex items-center gap-4">
          <IconButton icon="more" label="More" />
          <IconButton icon="more" label="More" className="bg-hover" />
          <IconButton icon="more" label="More" className="bg-pressed" />
          <IconButton icon="more" label="More" className={FOCUS} />
          <IconButton icon="more" label="More" disabled />
        </div>
      </Pair>

      <Pair name="Input 142:13172" figma={figmaInput}>
        <div className="grid grid-cols-2 gap-6">
          <Input
            label="Exam title"
            defaultValue="Mathematics 2 · Midterm"
            helper="Students see this name in the app."
          />
          <Input
            label="Exam title"
            defaultValue="Mathematics 2 · Midterm"
            helper="Students see this name in the app."
            className="[&>div]:shadow-focus [&>div]:inset-ring-2 [&>div]:inset-ring-line-focus"
          />
          <Input
            label="Exam title"
            defaultValue="Mathematics 2 · Midterm"
            helper="Students see this name in the app."
            error="Use 3–80 characters."
          />
          <Input
            label="Exam title"
            defaultValue="Mathematics 2 · Midterm"
            helper="Students see this name in the app."
            disabled
          />
          <Input label="Exam title" defaultValue="Mathematics 2 · Midterm" trailingIcon="chevron-down" />
        </div>
      </Pair>

      <Pair name="Text area 143:13134" figma={figmaTextArea}>
        <div className="grid grid-cols-2 gap-6">
          <TextArea
            label="Note for the reviewer"
            defaultValue="Phone face down after the warning. Put away within 6 s."
            helper="Reviewers and the committee see this note · 55/500"
          />
          <TextArea
            label="Note for the reviewer"
            defaultValue="Phone face down after the warning. Put away within 6 s."
            helper="Reviewers and the committee see this note · 55/500"
            className="[&>div]:shadow-focus [&>div]:inset-ring-2 [&>div]:inset-ring-line-focus"
          />
          <TextArea
            label="Note for the reviewer"
            defaultValue="Phone face down after the warning. Put away within 6 s."
            error="Reviewers and the committee see this note · 55/500"
          />
          <TextArea
            label="Note for the reviewer"
            defaultValue="Phone face down after the warning. Put away within 6 s."
            helper="Reviewers and the committee see this note · 55/500"
            disabled
          />
        </div>
      </Pair>

      <Pair name="Search field 45:2054 (shell/search-field.tsx)" figma={figmaSearch}>
        <SearchField label="Search" placeholder="Search students, exams" />
      </Pair>

      <Pair name="Checkbox 49:2176" figma={figmaCheckbox}>
        <div className="flex flex-col gap-4">
          <Checkbox defaultChecked label="I understand the rules and agree to on-device proctoring." />
          <Checkbox label="I understand the rules and agree to on-device proctoring." />
          <Checkbox
            label="I understand the rules and agree to on-device proctoring."
            boxClassName="shadow-focus"
          />
          <Checkbox disabled label="I understand the rules and agree to on-device proctoring." />
        </div>
      </Pair>

      <Pair name="Radio option 49:2188" figma={figmaRadio}>
        <RadioGroup aria-label="Decision" value={decision} onValueChange={setDecision} className="w-90 gap-6">
          <RadioOption value="none" title="No issue" detail="The phone was on the desk, face down." />
          <RadioOption value="other" title="No issue" detail="The phone was on the desk, face down." />
          <RadioOption value="off" title="No issue" detail="The phone was on the desk, face down." disabled />
        </RadioGroup>
      </Pair>

      <Pair name="Toggle 15:1314" figma={figmaToggle}>
        <div className="flex items-center gap-6">
          <Toggle aria-label="Toggle" checked={toggle} onCheckedChange={setToggle} />
          <Toggle aria-label="Toggle" checked={!toggle} onCheckedChange={(next) => setToggle(!next)} />
          <Toggle aria-label="Toggle" className="shadow-focus" defaultChecked />
          <Toggle aria-label="Toggle" disabled />
        </div>
      </Pair>

      <Pair name="Select 79:2410" figma={figmaSelect}>
        <div className="flex h-60 items-start gap-10">
          <Select
            label="Rules language"
            icon="globe"
            value={language}
            onValueChange={setLanguage}
            className="w-80"
          >
            <SelectItem value="kk" icon="globe" meta="ҚАЗ">
              Қазақша
            </SelectItem>
            <SelectItem value="ru" icon="globe" meta="РУС">
              Русский
            </SelectItem>
            <SelectItem value="en" icon="globe" meta="ENG">
              English
            </SelectItem>
          </Select>
          <SelectOpenMock />
        </div>
      </Pair>
    </div>
  );
}
