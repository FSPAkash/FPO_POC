from __future__ import annotations

import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree as ET

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


SOURCE_DOCX = Path("FPO_Integrated_System_Brief.docx")
OUTPUT_DIR = Path("deliverables")
BROCHURE_PDF = OUTPUT_DIR / "FPO_Integrated_System_Brochure.pdf"
MANUAL_PDF = OUTPUT_DIR / "FPO_Integrated_System_Operating_Manual.pdf"

ACCENT = colors.HexColor("#1F5F4A")
ACCENT_DARK = colors.HexColor("#173F34")
ACCENT_SOFT = colors.HexColor("#EAF2EE")
EARTH = colors.HexColor("#8E6E53")
INK = colors.HexColor("#1E2421")
MUTED = colors.HexColor("#5A655F")
RULE = colors.HexColor("#D9E3DD")
WHITE = colors.white


@dataclass
class Flow:
    title: str
    steps: list[str]


@dataclass
class SectionedBrief:
    title: str
    subtitle: str
    what_platform_is: list[str]
    achievements: list[str]
    commercial_outcomes: list[tuple[str, str]]
    audience: list[str]
    walkthrough_subtitle: str
    agent_roster: list[tuple[str, str]]
    runtime_flows: list[Flow]
    command_governance: list[str]
    policy_thresholds: list[str]
    technical_subtitle: str
    architecture: list[str]
    tech_stack: list[tuple[str, str]]
    data_domains: list[tuple[str, str]]
    api_surface: list[str]
    deployment_requirements: list[tuple[str, list[str]]]
    security_extensibility: list[str]


def extract_paragraphs(docx_path: Path) -> list[str]:
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    with zipfile.ZipFile(docx_path) as archive:
        xml = archive.read("word/document.xml")
    root = ET.fromstring(xml)

    paragraphs: list[str] = []
    for para in root.findall(".//w:p", ns):
        texts = [node.text or "" for node in para.findall(".//w:t", ns)]
        text = "".join(texts).strip()
        if text:
            paragraphs.append(text)
    return paragraphs


def slice_between(paragraphs: list[str], start: str, end: str | None) -> list[str]:
    start_idx = paragraphs.index(start) + 1
    end_idx = paragraphs.index(end) if end else len(paragraphs)
    return paragraphs[start_idx:end_idx]


def chunk_pairs(items: Iterable[str]) -> list[tuple[str, str]]:
    values = list(items)
    if len(values) % 2 != 0:
        raise ValueError(f"Expected an even number of values, got {len(values)}")
    return [(values[i], values[i + 1]) for i in range(0, len(values), 2)]


def parse_runtime_flows(lines: list[str]) -> list[Flow]:
    flows: list[Flow] = []
    current_title = ""
    current_steps: list[str] = []

    for line in lines:
        if re.match(r"^\d+\.\s", line):
            if current_title:
                flows.append(Flow(title=current_title, steps=current_steps))
            current_title = line
            current_steps = []
        else:
            current_steps.append(line)

    if current_title:
        flows.append(Flow(title=current_title, steps=current_steps))

    return flows


def parse_labeled_lines(lines: list[str]) -> list[str]:
    return [line for line in lines if line]


def parse_deployment_requirements(lines: list[str]) -> list[tuple[str, list[str]]]:
    sections: list[tuple[str, list[str]]] = []
    current_heading = ""
    current_items: list[str] = []

    for line in lines:
        if line.startswith("Priority "):
            if current_heading:
                sections.append((current_heading, current_items))
            current_heading = line
            current_items = []
        else:
            current_items.append(line)

    if current_heading:
        sections.append((current_heading, current_items))

    return sections


def parse_brief(docx_path: Path) -> SectionedBrief:
    paragraphs = extract_paragraphs(docx_path)

    commercial_lines = slice_between(paragraphs, "Commercial Outcomes", "Who It Is For")
    roster_lines = slice_between(paragraphs, "Specialist Agent Roster", "End-to-End Runtime Flows")
    tech_stack_lines = slice_between(paragraphs, "Technology Stack", "Core Data Domains")
    data_domain_lines = slice_between(paragraphs, "Core Data Domains", "Primary API Surface")

    commercial_pairs = chunk_pairs(commercial_lines[2:])
    roster_pairs = chunk_pairs(roster_lines[2:])
    tech_stack_pairs = chunk_pairs(tech_stack_lines[2:])
    data_domain_pairs = chunk_pairs(data_domain_lines[2:])

    return SectionedBrief(
        title=paragraphs[0],
        subtitle=paragraphs[1],
        what_platform_is=slice_between(paragraphs, "What the Platform Is", "What FPOs Achieve With It"),
        achievements=slice_between(paragraphs, "What FPOs Achieve With It", "Commercial Outcomes"),
        commercial_outcomes=commercial_pairs,
        audience=slice_between(paragraphs, "Who It Is For", "System Walkthrough"),
        walkthrough_subtitle=paragraphs[paragraphs.index("System Walkthrough") + 1],
        agent_roster=roster_pairs,
        runtime_flows=parse_runtime_flows(
            slice_between(paragraphs, "End-to-End Runtime Flows", "Command Centre and Governance")
        ),
        command_governance=slice_between(
            paragraphs, "Command Centre and Governance", "Policy Thresholds That Keep Autonomy Safe"
        ),
        policy_thresholds=parse_labeled_lines(
            slice_between(
                paragraphs, "Policy Thresholds That Keep Autonomy Safe", "Technical Manual"
            )
        ),
        technical_subtitle=paragraphs[paragraphs.index("Technical Manual") + 1],
        architecture=parse_labeled_lines(
            slice_between(paragraphs, "Architecture at a Glance", "Technology Stack")
        ),
        tech_stack=tech_stack_pairs,
        data_domains=data_domain_pairs,
        api_surface=parse_labeled_lines(
            slice_between(paragraphs, "Primary API Surface", "Data Requirements for Deployment")
        ),
        deployment_requirements=parse_deployment_requirements(
            slice_between(paragraphs, "Data Requirements for Deployment", "Security, Audit, and Extensibility")
        ),
        security_extensibility=parse_labeled_lines(
            slice_between(paragraphs, "Security, Audit, and Extensibility", None)
        ),
    )


def build_styles():
    styles = getSampleStyleSheet()

    styles.add(
        ParagraphStyle(
            name="BrochureTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=28,
            alignment=TA_CENTER,
            textColor=WHITE,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BrochureSubtitle",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=11.5,
            leading=15,
            alignment=TA_CENTER,
            textColor=WHITE,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SectionKicker",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=10,
            textColor=EARTH,
            spaceAfter=4,
            alignment=TA_LEFT,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H1Custom",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=19,
            leading=22,
            textColor=ACCENT_DARK,
            spaceAfter=8,
            spaceBefore=2,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H2Custom",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=14,
            textColor=ACCENT_DARK,
            spaceAfter=6,
            spaceBefore=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodyCustom",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=INK,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodyMuted",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=MUTED,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BulletCustom",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13,
            leftIndent=12,
            firstLineIndent=-8,
            bulletIndent=0,
            textColor=INK,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Callout",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=15,
            alignment=TA_CENTER,
            textColor=ACCENT_DARK,
            spaceAfter=0,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ManualTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=23,
            leading=28,
            textColor=WHITE,
            alignment=TA_LEFT,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ManualSubtitle",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=11,
            leading=15,
            textColor=WHITE,
            alignment=TA_LEFT,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SmallCapsLike",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=EARTH,
            spaceAfter=4,
        )
    )
    return styles


def outcome_table(data: list[tuple[str, str]], styles) -> Table:
    rows = [
        [
            Paragraph("<b>Outcome</b>", styles["BodyCustom"]),
            Paragraph("<b>How the platform delivers it</b>", styles["BodyCustom"]),
        ]
    ]
    for outcome, description in data:
        rows.append([Paragraph(outcome, styles["BodyCustom"]), Paragraph(description, styles["BodyCustom"])])

    table = Table(rows, colWidths=[48 * mm, 116 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), ACCENT_DARK),
                ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
                ("BACKGROUND", (0, 1), (-1, -1), WHITE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, ACCENT_SOFT]),
                ("BOX", (0, 0), (-1, -1), 0.8, RULE),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, RULE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def two_column_table(title_a: str, title_b: str, data: list[tuple[str, str]], widths: tuple[float, float], styles) -> Table:
    rows = [
        [
            Paragraph(f"<b>{title_a}</b>", styles["BodyCustom"]),
            Paragraph(f"<b>{title_b}</b>", styles["BodyCustom"]),
        ]
    ]
    for left, right in data:
        rows.append([Paragraph(left, styles["BodyCustom"]), Paragraph(right, styles["BodyCustom"])])

    table = Table(rows, colWidths=list(widths), hAlign="LEFT", repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), ACCENT_DARK),
                ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, ACCENT_SOFT]),
                ("BOX", (0, 0), (-1, -1), 0.8, RULE),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, RULE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def card_grid(items: list[str], styles) -> Table:
    cells = []
    for item in items:
        label, detail = item.split(":", 1)
        html = (
            f"<font color='{ACCENT_DARK}'><b>{label.strip()}:</b></font> "
            f"<font color='{INK}'>{detail.strip()}</font>"
        )
        cells.append(Paragraph(html, styles["BodyCustom"]))

    rows = []
    for index in range(0, len(cells), 2):
        pair = cells[index:index + 2]
        if len(pair) < 2:
            pair.append(Paragraph("", styles["BodyCustom"]))
        rows.append(pair)

    table = Table(rows, colWidths=[82 * mm, 82 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), WHITE),
                ("BOX", (0, 0), (-1, -1), 0.8, RULE),
                ("INNERGRID", (0, 0), (-1, -1), 0.8, RULE),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [WHITE, ACCENT_SOFT]),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return table


def bullet_paragraphs(items: list[str], styles) -> list:
    flowables = []
    for item in items:
        flowables.append(Paragraph(item, styles["BulletCustom"], bulletText="•"))
    return flowables


def draw_brochure_first_page(canvas, doc):
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(ACCENT_DARK)
    canvas.rect(0, height - 98 * mm, width, 98 * mm, fill=1, stroke=0)
    canvas.setFillColor(ACCENT)
    canvas.rect(0, height - 116 * mm, width, 18 * mm, fill=1, stroke=0)
    canvas.setFillColor(ACCENT_SOFT)
    canvas.rect(15 * mm, 18 * mm, width - 30 * mm, 52 * mm, fill=1, stroke=0)
    canvas.setStrokeColor(WHITE)
    canvas.setLineWidth(1)
    canvas.line(26 * mm, height - 40 * mm, width - 26 * mm, height - 40 * mm)
    canvas.restoreState()


def draw_brochure_later_pages(canvas, doc):
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(ACCENT_SOFT)
    canvas.rect(0, height - 18 * mm, width, 18 * mm, fill=1, stroke=0)
    canvas.setFillColor(ACCENT_DARK)
    canvas.rect(0, 0, width, 11 * mm, fill=1, stroke=0)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.setFillColor(ACCENT_DARK)
    canvas.drawString(18 * mm, height - 12.5 * mm, "FPO Integrated Operating System")
    canvas.setFillColor(WHITE)
    canvas.drawRightString(width - 18 * mm, 4 * mm, f"Brochure | Page {doc.page}")
    canvas.restoreState()


def draw_manual_first_page(canvas, doc):
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(ACCENT_DARK)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setFillColor(ACCENT)
    canvas.rect(0, height - 42 * mm, width, 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#2A7B61"))
    canvas.circle(width - 26 * mm, height - 30 * mm, 22 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#295645"))
    canvas.circle(width - 42 * mm, height - 72 * mm, 18 * mm, fill=1, stroke=0)
    canvas.restoreState()


def draw_manual_later_pages(canvas, doc):
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(ACCENT_SOFT)
    canvas.rect(0, height - 14 * mm, width, 14 * mm, fill=1, stroke=0)
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.7)
    canvas.line(15 * mm, 15 * mm, width - 15 * mm, 15 * mm)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.setFillColor(ACCENT_DARK)
    canvas.drawString(18 * mm, height - 9.5 * mm, "FPO Integrated System Operating Manual")
    canvas.drawRightString(width - 18 * mm, 8 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_brochure(brief: SectionedBrief, styles) -> None:
    doc = SimpleDocTemplate(
        str(BROCHURE_PDF),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="FPO Integrated System Brochure",
        author="OpenAI Codex",
    )

    story = [
        Spacer(1, 30 * mm),
        Paragraph(brief.title, styles["BrochureTitle"]),
        Paragraph("Brochure", styles["BrochureSubtitle"]),
        Paragraph(brief.subtitle, styles["BrochureSubtitle"]),
        Spacer(1, 12 * mm),
        Table(
            [[Paragraph("Autonomous by default. Human only by exception.", styles["Callout"])]],
            colWidths=[170 * mm],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), WHITE),
                    ("BOX", (0, 0), (-1, -1), 0.8, RULE),
                    ("LEFTPADDING", (0, 0), (-1, -1), 12),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                    ("TOPPADDING", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ]
            ),
        ),
        Spacer(1, 12 * mm),
        Paragraph("What The Platform Is", styles["SectionKicker"]),
    ]

    story.extend(Paragraph(paragraph, styles["BodyCustom"]) for paragraph in brief.what_platform_is)
    story.append(PageBreak())

    story.extend(
        [
            Paragraph("What FPOs Achieve With It", styles["H1Custom"]),
            card_grid(brief.achievements, styles),
            Spacer(1, 8 * mm),
            Paragraph("Commercial Outcomes", styles["H2Custom"]),
            outcome_table(brief.commercial_outcomes, styles),
            Spacer(1, 7 * mm),
            Paragraph("Who It Is For", styles["H2Custom"]),
        ]
    )
    story.extend(Paragraph(paragraph, styles["BodyCustom"]) for paragraph in brief.audience)
    story.append(PageBreak())

    story.extend(
        [
            Paragraph("System Walkthrough", styles["H1Custom"]),
            Paragraph(brief.walkthrough_subtitle, styles["BodyMuted"]),
            Paragraph("Specialist Agent Roster", styles["H2Custom"]),
            two_column_table(
                "Agent",
                "Responsibility",
                brief.agent_roster,
                (48 * mm, 116 * mm),
                styles,
            ),
            Spacer(1, 8 * mm),
            Paragraph("End-to-End Runtime Flows", styles["H2Custom"]),
        ]
    )

    for flow in brief.runtime_flows:
        story.append(Paragraph(flow.title, styles["BodyCustom"]))
        story.extend(bullet_paragraphs(flow.steps, styles))
        story.append(Spacer(1, 2 * mm))

    story.append(PageBreak())
    story.extend(
        [
            Paragraph("Governance And Safe Autonomy", styles["H1Custom"]),
            Paragraph("Command Centre and Governance", styles["H2Custom"]),
        ]
    )
    story.extend(Paragraph(paragraph, styles["BodyCustom"]) for paragraph in brief.command_governance)
    story.append(Paragraph("Policy Thresholds That Keep Autonomy Safe", styles["H2Custom"]))
    story.extend(bullet_paragraphs(brief.policy_thresholds, styles))

    doc.build(
        story,
        onFirstPage=draw_brochure_first_page,
        onLaterPages=draw_brochure_later_pages,
    )


def build_manual(brief: SectionedBrief, styles) -> None:
    doc = SimpleDocTemplate(
        str(MANUAL_PDF),
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title="FPO Integrated System Operating Manual",
        author="OpenAI Codex",
    )

    story = [
        Spacer(1, 28 * mm),
        Paragraph(brief.title, styles["ManualTitle"]),
        Paragraph("Operating Manual", styles["ManualTitle"]),
        Paragraph(brief.technical_subtitle, styles["ManualSubtitle"]),
        Spacer(1, 10 * mm),
        Spacer(1, 98 * mm),
        Paragraph("System Walkthrough", styles["ManualSubtitle"]),
        Paragraph(brief.walkthrough_subtitle, styles["ManualSubtitle"]),
        PageBreak(),
        Paragraph("Architecture At A Glance", styles["H1Custom"]),
    ]

    story.extend(bullet_paragraphs(brief.architecture, styles))
    story.extend(
        [
            Spacer(1, 4 * mm),
            Paragraph("Technology Stack", styles["H2Custom"]),
            two_column_table("Layer", "Technology", brief.tech_stack, (44 * mm, 120 * mm), styles),
            Spacer(1, 6 * mm),
            Paragraph("Core Data Domains", styles["H2Custom"]),
            two_column_table("Domain", "Key fields", brief.data_domains, (42 * mm, 122 * mm), styles),
            PageBreak(),
            Paragraph("Specialist Agent Roster", styles["H1Custom"]),
            two_column_table("Agent", "Responsibility", brief.agent_roster, (48 * mm, 116 * mm), styles),
            Spacer(1, 6 * mm),
            Paragraph("End-to-End Runtime Flows", styles["H2Custom"]),
        ]
    )

    for flow in brief.runtime_flows:
        story.append(Paragraph(flow.title, styles["BodyCustom"]))
        story.extend(bullet_paragraphs(flow.steps, styles))
        story.append(Spacer(1, 2 * mm))

    story.extend(
        [
            PageBreak(),
            Paragraph("Command Centre And Governance", styles["H1Custom"]),
        ]
    )
    story.extend(Paragraph(paragraph, styles["BodyCustom"]) for paragraph in brief.command_governance)
    story.append(Paragraph("Policy Thresholds That Keep Autonomy Safe", styles["H2Custom"]))
    story.extend(bullet_paragraphs(brief.policy_thresholds, styles))

    story.extend(
        [
            Spacer(1, 6 * mm),
            Paragraph("Primary API Surface", styles["H2Custom"]),
        ]
    )
    story.extend(bullet_paragraphs(brief.api_surface, styles))
    story.append(PageBreak())

    story.append(Paragraph("Data Requirements For Deployment", styles["H1Custom"]))
    for heading, items in brief.deployment_requirements:
        story.append(Paragraph(heading, styles["H2Custom"]))
        story.extend(bullet_paragraphs(items, styles))

    story.extend(
        [
            Spacer(1, 6 * mm),
            Paragraph("Security, Audit, and Extensibility", styles["H1Custom"]),
        ]
    )
    story.extend(bullet_paragraphs(brief.security_extensibility, styles))

    doc.build(
        story,
        onFirstPage=draw_manual_first_page,
        onLaterPages=draw_manual_later_pages,
    )


def main() -> None:
    if not SOURCE_DOCX.exists():
        raise FileNotFoundError(f"Missing source document: {SOURCE_DOCX}")

    OUTPUT_DIR.mkdir(exist_ok=True)
    styles = build_styles()
    brief = parse_brief(SOURCE_DOCX)

    build_brochure(brief, styles)
    build_manual(brief, styles)

    print(BROCHURE_PDF)
    print(MANUAL_PDF)


if __name__ == "__main__":
    main()
