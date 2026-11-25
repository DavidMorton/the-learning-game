"""Tag every question in each deck with one or more focus tags.

Sections stay the primary grouping (they carry exam weights). Tags are a second, overlapping
way to slice a deck: a question about oversharing through a Fabric data agent is tagged both
"Fabric data agents" and "Oversharing", so a player can practice one technology or one theme
across every section.

Tags come from keyword rules below plus a short list of manual overrides. Question-style tags
(Definitions, Best fit, Troubleshooting and so on) are the exception: they describe what kind of
question it is, so they're set by hand when a question is written, and this script keeps them.
Run this after adding or editing questions:

    python3 tools/tag_questions.py

It rewrites the "tags" list on each deck and on each question, and leaves everything else as is.
Rule fields: q = question, a = correct answer, t = topic, e = explanation.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

TECH, THEME, STYLE = "technology", "theme", "style"

# Question styles, set by hand on each question (not by keyword rules), in display order.
STYLE_TAGS = [
    ("style-definition", "Definitions"),
    ("style-best-fit", "Best practice"),
    ("style-lookalikes", "Look-alikes"),
    ("style-troubleshooting", "Troubleshooting"),
    ("style-objections", "Objections and myths"),
    ("style-request-flow", "Following a request"),
    ("style-prerequisites", "Prerequisites and approvals"),
    ("style-cost-math", "Cost estimates"),
]
STYLE_IDS = [s[0] for s in STYLE_TAGS]


def tag(id, name, kind, pattern, fields="qat"):
    return {"id": id, "name": name, "kind": kind, "re": re.compile(pattern, re.I), "fields": fields}


# Shared theme rules, reused by more than one deck.
PRICING = r"\$\d|\bprice|pricing|\bcost|\bbill|PAYG|pay-as-you-go|\bMACC\b|\bcharge|\bfree\b|\bspend|budget|overage|discount|\bpays?\b|credits?\b"
RESIDENCY = r"residen|EU Data Boundary|\bEUDB\b|cross-geo|\bregions?\b|\bGeo\b|sovereign|government cloud|\bGCC\b|East US 2|train foundation|paired region|compliance boundary"

DECKS = {
    "copilot-questions.json": [
        tag("m365-copilot", "Microsoft 365 Copilot", TECH, r"Microsoft 365 Copilot|Copilot (seat|license)|\bPremium\b|Copilot Business|\bE7\b|Frontier Suite|Copilot in (Word|Excel|PowerPoint|Outlook)|everyday AI"),
        tag("copilot-chat", "Copilot Chat", TECH, r"Copilot Chat"),
        tag("cowork", "Cowork, Code and Autopilot", TECH, r"\bCowork\b|Copilot Code|Autopilot|agentic system"),
        tag("copilot-studio", "Copilot Studio", TECH, r"Copilot Studio|agent flows?|capacity pack|generative answer|classic answer|agent action|tenant graph grounding|harness|computer-using|reasoning(-capable)? model|\bvoice\b"),
        tag("agent-types", "Agent types and builders", TECH, r"declarative agent|custom engine|Agent Builder|Agents Toolkit|Work IQ Dev Tools|proactive"),
        tag("foundry", "Microsoft Foundry", TECH, r"Foundry"),
        tag("agent-365", "Agent 365", TECH, r"Agent 365|ownerless|agent registry"),
        tag("entra", "Entra and agent identity", TECH, r"Entra|agent identit|service principal|on-behalf-of|(?-i:\bOBO\b)|managed identity|Conditional Access|admin consent"),
        tag("purview", "Microsoft Purview", TECH, r"Purview|(?-i:DSPM)|sensitivity label|DLP (policy )?for (Microsoft 365 )?Copilot|Insider Risk|eDiscovery|unified audit log|Communication Compliance|(?-i:EXTRACT)"),
        tag("sharepoint", "SharePoint controls", TECH, r"SharePoint Advanced Management|(?-i:\bSAM\b)|Restricted Content Discovery|(?-i:\bRCD\b)|Restricted SharePoint Search|(?-i:\bRSS\b)|Restricted Access Control|(?-i:\bRAC\b)|site access review|data access governance|(?-i:\bDAG\b)|(?-i:EEEU)|Everyone Except External"),
        tag("work-iq", "Work IQ and Microsoft IQ", TECH, r"Work IQ|Microsoft IQ|Fabric IQ|Foundry IQ"),
        tag("power-platform", "Power Platform", TECH, r"Power Platform|Power Apps|Power Automate|data polic(y|ies)|(?-i:PPAC)"),
        tag("mcp", "MCP and A2A", TECH, r"(?-i:\bMCP\b)|Model Context Protocol|(?-i:\bA2A\b)"),
        tag("teams", "Microsoft Teams", TECH, r"\bTeams\b"),
        tag("security-copilot", "Security Copilot", TECH, r"Security Copilot|Security Compute Unit|(?-i:\bSCUs?\b)"),
        tag("fabric", "Microsoft Fabric", TECH, r"Fabric|OneLake|Direct Lake|mirror"),
        tag("fabric-data-agents", "Fabric data agents", TECH, r"data agent"),
        tag("genie", "Databricks Genie", TECH, r"Genie"),
        tag("unity-catalog", "Unity Catalog", TECH, r"Unity Catalog|row filter|column mask"),
        tag("researcher-analyst", "Researcher and Analyst", TECH, r"Researcher|Analyst"),
        tag("power-bi", "Power BI", TECH, r"Power BI"),
        tag("pricing", "Pricing and cost", THEME, PRICING),
        tag("licensing", "Licensing", THEME, r"licen[cs]|\bSKUs?\b|\bE[357]\b|\bseats?\b|add-on|Copilot Business|subscription|entitle"),
        tag("spend-controls", "Spend controls", THEME, r"spending polic|budget|\blimits?\b|enforce|\bcaps?\b|125%|block(ed|s)? |Auto-apply|billing polic|disconnect|run out|runs out|overage"),
        tag("governance", "Governance", THEME, r"govern|data polic|(?-i:\bDLP\b)|\bpublish|approv|registry|\baudit|admin (control|center)|tenant setting|lifecycle|ownerless|Lockbox|customer-managed key|(?-i:\bCMK\b)|authentication option|policy"),
        tag("security", "Security and identity", THEME, r"secur|permission|identity|authenticat|Entra|access control|row filter|column mask|encrypt|Private Link|(?-i:\bOBO\b)|on-behalf-of|service principal|least privilege|consent|sign[- ]?in"),
        tag("oversharing", "Oversharing", THEME, r"overshar|Everyone Except External|(?-i:EEEU)|Restricted Content Discovery|Restricted SharePoint Search|Restricted Access Control|site access review|data access governance|No authentication|anyone with the link|author authentication|snapshot|shouldn't|grant(s|ed)? access|permission hygiene|bypass", "qate"),
        tag("residency", "Data residency and privacy", THEME, RESIDENCY, "qate"),
        tag("seat-strategy", "Seat strategy and adoption", THEME, r"usage report|readiness report|active user|inactive|idle seat|reassign|\bseats?\b|adoption|Copilot Dashboard|Organizational Messages|candidate|renewal|nonreduction|\bpilot"),
        tag("architecture", "Agent architecture", THEME, r"decision tree|SaaS agent|\bbuild|connected agent|child agent|multi-agent|single agent|evaluation|test set|acceptance threshold|\bALM\b|custom solution|environment routing|knowledge source|ungrounded|declarative agent|custom engine|operational responsibility"),
        tag("whats-new", "New in 2026", THEME, r"Ignite 2026|\b2026\b|\b2027\b", "q"),
    ],
    "agents-questions.json": [
        tag("genie", "Databricks Genie", TECH, r"Genie"),
        tag("agent-bricks", "Agent Bricks", TECH, r"Agent Bricks|Knowledge Assistant|Supervisor Agent|Information Extraction|Agent Runtime|DurableAgentServer|AgentServer|Omnigent|Databricks Sandbox|ResponsesAgent|agents\.deploy|LangGraph|agent memory"),
        tag("unity-gateway", "Unity Gateway", TECH, r"Unity (AI )?Gateway|AI Gateway|guardrail|inference tables?|Smart Routing|service polic|external model"),
        tag("unity-catalog", "Unity Catalog", TECH, r"Unity Catalog|row filter|column mask|(?-i:\bUC\b)|metric view|(?-i:\bSELECT\b)|(?-i:\bEXECUTE\b)"),
        tag("mlflow", "MLflow and evaluation", TECH, r"MLflow|\btrac(e|es|ing)\b|scorer|LLM judge|Review App|labeling session|log_feedback|production monitoring"),
        tag("model-serving", "Model Serving and FMAPI", TECH, r"Foundation Model API|pay-per-token|provisioned throughput|Model Serving|serving endpoint|(?-i:\bFMAPI\b)|model units|priority|GPU|scale.to.zero|Llama|Sonnet"),
        tag("mcp", "MCP and tools", TECH, r"(?-i:\bMCP\b)|function tool|\btools?\b"),
        tag("lakebase", "Lakebase", TECH, r"Lakebase|Postgres"),
        tag("apps", "Databricks Apps", TECH, r"Databricks Apps|on Apps\b|bundle (deploy|run)|app authorization|user authorization"),
        tag("ai-search", "AI Search", TECH, r"AI Search|Vector Search|Delta Sync|Direct Vector Access|embedding"),
        tag("ai-functions", "AI Functions", TECH, r"AI Functions?|ai_query|ai_parse_document|ai_extract|ai_classify|Document Intelligence"),
        tag("metric-views", "Metric views", TECH, r"metric views?|MEASURE\("),
        tag("openai", "OpenAI ChatGPT", TECH, r"ChatGPT|(?-i:OpenAI)"),
        tag("anthropic", "Anthropic Claude", TECH, r"Claude Enterprise|Claude Team|Claude for|Anthropic's|Team plan|\bClaude\b(?! Sonnet| Haiku| Opus)"),
        tag("google", "Google Gemini Enterprise", TECH, r"Gemini Enterprise|Google's"),
        tag("aws", "AWS AgentCore and Quick", TECH, r"AgentCore|(?-i:\bAWS\b)|Amazon|\bQuick\b"),
        tag("snowflake", "Snowflake Cortex", TECH, r"Snowflake|Cortex"),
        tag("salesforce", "Salesforce Agentforce", TECH, r"Agentforce|Salesforce|Flex Credit"),
        tag("glean", "Glean", TECH, r"Glean"),
        tag("m365-copilot", "Microsoft Copilot", TECH, r"Copilot"),
        tag("pricing", "Pricing and cost", THEME, PRICING + r"|(?-i:\bDBUs?\b)|\btokens?\b|cheap|expensive"),
        tag("spend-controls", "Spend controls", THEME, r"budget|threshold|block usage|rate limit|hard cap|\bcaps?\b|overspend|chargeback"),
        tag("governance", "Governance", THEME, r"govern|\baudit|policy|policies|guardrail|registered in Unity Catalog|least privilege|retention|Compliance API"),
        tag("security", "Security and identity", THEME, r"secur|permission|identity|authenticat|authoriz|row filter|column mask|encrypt|Private Link|(?-i:\bOBO\b)|on-behalf-of|service principal|least privilege|OAuth|access token|(?-i:\bSCIM\b)|(?-i:\bSSO\b)|CAN (RUN|USE|QUERY|VIEW|EDIT|MANAGE)|PII"),
        tag("residency", "Data residency and privacy", THEME, RESIDENCY + r"|US-only|public internet|abuse detection|training", "qate"),
        tag("quality", "Quality and evaluation", THEME, r"benchmark|accura|evaluat|scorer|judge|quality|feedback|non-deterministic|verified answer|trusted asset"),
        tag("architecture", "Agent architecture", THEME, r"\bdesign|which approach|pattern|multi-agent|subagent|memory|\bbuild|low-code|code-based|front door|batch"),
        tag("competitive", "Competitive landscape", THEME, r"ChatGPT|(?-i:OpenAI)|Claude Enterprise|Claude Team|Anthropic's|Gemini Enterprise|AgentCore|(?-i:\bAWS\b)|Snowflake|Cortex|Agentforce|Salesforce|Glean|Copilot"),
        tag("whats-new", "New in 2026", THEME, r"\b2026\b|\b2027\b|Summit|(?-i:DAIS)|legacy|renam|formerly|used to be called", "q"),
    ],
    "fabric-questions.json": [
        tag("capacity", "Capacity and SKUs", TECH, r"capacit|(?-i:\bCUs?\b)|\bF SKU|(?-i:\bF\d+\b)|(?-i:\bP SKU)|(?-i:\bP1\b)|\bSKUs?\b|\btrial\b|\bpaus|reserv|overage|on-demand"),
        tag("throttling", "Smoothing and throttling", TECH, r"smooth|throttl|burst|carryforward|surge protection|CapacityLimitExceeded|timepoint|Metrics app|overage protection|interactive (delay|rejection|operations)|background (rejection|operations)"),
        tag("onelake", "OneLake", TECH, r"OneLake|soft[- ]delet|(?-i:\bBCDR\b)|(?-i:\bZRS\b)|(?-i:\bLRS\b)|storage tier|cool or cold"),
        tag("shortcuts", "Shortcuts", TECH, r"shortcut"),
        tag("mirroring", "Mirroring", TECH, r"mirror"),
        tag("direct-lake", "Direct Lake", TECH, r"Direct Lake|framing|DirectLakeBehavior|guardrail"),
        tag("power-bi", "Power BI", TECH, r"Power BI|semantic model|(?-i:\bPro\b)|(?-i:\bPPU\b)|Premium Per User|\breports?\b|viewers?\b|embed"),
        tag("warehouse", "Warehouse and SQL", TECH, r"Warehouse|SQL analytics endpoint|T-SQL|SQL database|cross-database|HorizonDB|Database Hub"),
        tag("spark", "Spark and data engineering", TECH, r"Spark|notebook|Native Execution Engine|vCore|environment|Velox|Runtime"),
        tag("rti", "Real-Time Intelligence", TECH, r"Real-Time|Eventhouse|Eventstream|Activator|(?-i:\bKQL\b)"),
        tag("data-factory", "Data Factory", TECH, r"Data Factory|Dataflow|Copy job|copy activity|\bgateway|activity runs"),
        tag("data-agents", "Fabric data agents", TECH, r"data agent"),
        tag("copilot-fabric", "Copilot in Fabric", TECH, r"Copilot|Azure OpenAI"),
        tag("fabric-iq", "Fabric IQ", TECH, r"Fabric IQ|ontolog"),
        tag("databricks", "Databricks interop", TECH, r"Databricks|Unity Catalog|federation|Genie|metric view|(?-i:\bDBUs?\b)"),
        tag("networking", "Networking", TECH, r"Private Link|private endpoint|VNet|firewall|network|public internet|egress|\bgateway"),
        tag("cicd", "CI/CD", TECH, r"\bGit\b|deployment pipeline|CI/CD|(?-i:\bCLI\b)|variable librar|Terraform"),
        tag("pricing", "Pricing and cost", THEME, PRICING + r"|CU-seconds|consum"),
        tag("licensing", "Licensing", THEME, r"licen[cs]|(?-i:\bPro\b)|(?-i:\bPPU\b)|Premium Per User|\bSKUs?\b|\btrial\b|(?-i:\bF64\b)"),
        tag("governance", "Governance", THEME, r"govern|\bdomains?\b|Purview|tenant setting|sensitivity label|(?-i:\bDLP\b)|\baudit|lineage|OneLake catalog|CI/CD|deployment pipeline"),
        tag("security", "Security and identity", THEME, r"secur|permission|\broles?\b|identity|(?-i:\bRLS\b)|(?-i:\bCLS\b)|row-level|column-level|row filter|column mask|encrypt|(?-i:\bCMK\b)|customer-managed|Private Link|\bViewers?\b|Contributor|\bAdmin\b|Entra|service principal|managed identity"),
        tag("oversharing", "Oversharing", THEME, r"overshar|bypass|author authentication|grant access|doesn't grant|(?-i:ReadAll)|second governance|snapshot|can't tell users apart|least privilege", "qate"),
        tag("residency", "Data residency and privacy", THEME, RESIDENCY, "qate"),
        tag("performance", "Performance and freshness", THEME, r"\bslow|latency|performance|faster|fallback|guardrail|\bsync|\blag\b|cach|accelerat|fresh|stale"),
        tag("whats-new", "New in 2026", THEME, r"Ignite 2026|\b2026\b", "q"),
    ],
    "questions.json": [
        tag("auto-loader", "Auto Loader", TECH, r"Auto Loader|cloudFiles"),
        tag("copy-into", "COPY INTO", TECH, r"COPY INTO"),
        tag("lakeflow-connect", "Lakeflow Connect", TECH, r"Lakeflow Connect|managed connector|standard connector"),
        tag("pipelines", "Lakeflow Declarative Pipelines", TECH, r"Declarative Pipeline|Lakeflow Spark Declarative|(?-i:\bDLT\b)|Delta Live Tables|streaming tables?|materialized views?|expectations?|pipeline (update|task)"),
        tag("jobs", "Lakeflow Jobs", TECH, r"Lakeflow Jobs|job runs?\b|run if|if/else|for each task|task values?|task dependenc|file arrival|table update trigger|repair run|run history|matrix view|(notebook|pipeline|SQL|dashboard) task|job (parameter|status|monitoring)"),
        tag("delta", "Delta Lake", TECH, r"Delta|OPTIMIZE|VACUUM|time travel|liquid clustering|Z-?ORDER|predictive optimization|DESCRIBE (HISTORY|DETAIL)|managed table|external table|\bCLONE\b|deletion vector"),
        tag("unity-catalog", "Unity Catalog", TECH, r"Unity Catalog|\bcatalogs?\b|\bGRANT\b|\bREVOKE\b|\bvolumes?\b|metastore|(?-i:\bABAC\b)|row filter|column mask|governed tag|dynamic view|privilege"),
        tag("spark", "Spark and PySpark", TECH, r"Spark|PySpark|DataFrame|\bdf\.|spark\.|\bjoins?\b|\bunion|groupBy|explode|withColumn|\.agg\(|broadcast|approx_count_distinct"),
        tag("compute", "Compute and SQL warehouses", TECH, r"\bclusters?\b|\bcompute\b|serverless|SQL warehouse|instance pool|access mode|Photon|\bdriver\b|executor|node type"),
        tag("bundles", "Declarative Automation Bundles", TECH, r"\bbundles?\b|databricks\.yml|Asset Bundle|(?-i:\bDAB)|deployment mode"),
        tag("cli", "Databricks CLI", TECH, r"Databricks CLI|(?-i:\bCLI\b)|databricks (bundle|fs|jobs|workspace|auth)\b"),
        tag("git-folders", "Git folders", TECH, r"Git folder|\bRepos\b|\bbranch|pull request|\bcommit|\bGit\b"),
        tag("ingestion", "Ingestion", THEME, r"ingest|Auto Loader|COPY INTO|Lakeflow Connect|(?-i:\bJDBC\b)|(?-i:\bREST\b)|upload|file arrival|landing|load(s|ing)? (data|files)"),
        tag("streaming", "Streaming and incremental", THEME, r"stream|incremental|checkpoint|availableNow|continuous|readStream|writeStream|exactly-once"),
        tag("data-quality", "Data quality", THEME, r"quality|expectation|dedup|duplicate|\bnulls?\b|\bclean|validat|constraint|\bCHECK\b|malformed|rescued"),
        tag("semi-structured", "Semi-structured data", THEME, r"(?-i:JSON)|nested|\bstruct|\barray|explode|\bvariant\b|semi-structured|from_json|schema (evolution|inference|hints)|unstructured"),
        tag("governance", "Governance and access", THEME, r"permission|\bGRANT\b|\baccess\b|(?-i:\bABAC\b)|row filter|column mask|dynamic view|governed tag|privilege|\bowner|\baudit|lineage|Unity Catalog"),
        tag("performance", "Performance tuning", THEME, r"performance|tuning|\bslow|\bskew|\bspill|shuffle|partition|\bcach|(?-i:\bOOM\b)|out-of-memory|Spark UI|query profile|liquid clustering|optimiz|broadcast|Photon|(?-i:\bAQE\b)"),
        tag("troubleshooting", "Troubleshooting", THEME, r"\bfail|error|troubleshoot|repair|status|retr(y|ies)|conflict|startup|debug|monitor|run history|out-of-memory"),
        tag("cost", "Cost", THEME, r"\bcost|(?-i:\bDBUs?\b)|\bprice|pricing|\bbilling|cheap|expensive|budget|idle"),
        tag("cicd", "CI/CD", THEME, r"CI/CD|\bbundles?\b|\bGit\b|\bdeploy|\btargets?\b|(?-i:\bCLI\b)|\bdev\b|\bprod\b|production"),
    ],
}

# Every question in these sections gets these tags, so tags agree with the section they sit in.
SECTION_TAGS = {
    "copilot-questions.json": {2: ["licensing"], 3: ["pricing"], 4: ["copilot-studio", "governance"], 5: ["governance"], 7: ["genie"], 9: ["seat-strategy", "m365-copilot"], 10: ["architecture"]},
    "fabric-questions.json": {2: ["capacity"], 3: ["throttling", "capacity"], 4: ["onelake"], 6: ["security"], 7: ["copilot-fabric"], 8: ["databricks"]},
    "agents-questions.json": {2: ["genie"], 4: ["governance"], 6: ["pricing"], 7: ["competitive"], 8: ["architecture"]},
    "questions.json": {2: ["ingestion"], 4: ["jobs"], 5: ["cicd"], 6: ["troubleshooting"], 7: ["governance"]},
}

# Manual corrections where keyword rules miss the point of a question. id -> {"add": [...], "remove": [...]}
OVERRIDES = {
    # Copilot deck
    "C1-005": {"add": ["security"]},
    "C5-001": {"add": ["oversharing"]},
    "C8-018": {"add": ["oversharing"]},
    "C4-025": {"add": ["fabric", "oversharing", "security"]},
    "C4-026": {"add": ["fabric"]},
    "C7-007": {"add": ["oversharing"]},
    "C7-008": {"add": ["oversharing"]},
    # Fabric deck
    "F6-004": {"add": ["oversharing"]},
    "F8-019": {"add": ["oversharing"]},
    "F7-013": {"add": ["security", "oversharing"]},
    "F4-004": {"add": ["oversharing", "security"]},
    "F5-013": {"add": ["oversharing", "security"]},
    "F6-008": {"add": ["oversharing"]},
    "F8-002": {"add": ["oversharing", "governance"]},
    "F8-003": {"add": ["oversharing", "networking"]},
    "F8-006": {"add": ["oversharing", "security"]},
    "F1-015": {"add": ["spark"]},
    "C5-020": {"add": ["m365-copilot"]},
    "C5-022": {"add": ["m365-copilot", "purview", "security"]},
    "C5-023": {"add": ["m365-copilot", "residency"]},
    # Databricks deck
    "S3-058": {"add": ["unity-catalog"]},
    "S7-006": {"add": ["unity-catalog", "delta"]},
}


def text_for(q, fields):
    parts = {
        "q": q["question"],
        "a": q["choices"][q["answerIndex"]],
        "t": q.get("topic", ""),
        "e": q.get("explanation", ""),
    }
    return "\n".join(parts[f] for f in fields)


def main():
    for filename, rules in DECKS.items():
        path = ROOT / filename
        deck = json.loads(path.read_text())
        order = [r["id"] for r in rules] + STYLE_IDS
        counts = {t: 0 for t in order}
        untagged = []
        for q in deck["questions"]:
            tags = {r["id"] for r in rules if r["re"].search(text_for(q, r["fields"]))}
            tags |= set(SECTION_TAGS.get(filename, {}).get(q["section"], []))
            fix = OVERRIDES.get(q["id"], {})
            tags = (tags | set(fix.get("add", []))) - set(fix.get("remove", []))
            tags |= set(q.get("tags", [])) & set(STYLE_IDS)  # hand-set styles survive a rerun
            q_tags = [t for t in order if t in tags]
            # Rebuild the question with tags placed right after topic.
            rebuilt = {}
            for k, v in q.items():
                if k == "tags":
                    continue
                rebuilt[k] = v
                if k == "topic":
                    rebuilt["tags"] = q_tags
            if "tags" not in rebuilt:
                rebuilt["tags"] = q_tags
            q.clear()
            q.update(rebuilt)
            for t in q_tags:
                counts[t] += 1
            if not q_tags:
                untagged.append(q["id"])
        tag_list = [{"id": r["id"], "name": r["name"], "kind": r["kind"], "count": counts[r["id"]]}
                    for r in rules if counts[r["id"]]]
        tag_list += [{"id": id, "name": name, "kind": STYLE, "count": counts[id]}
                     for id, name in STYLE_TAGS if counts[id]]
        rebuilt_deck = {}
        for k, v in deck.items():
            if k == "tags":
                continue
            rebuilt_deck[k] = v
            if k == "sections":
                rebuilt_deck["tags"] = tag_list
        path.write_text(json.dumps(rebuilt_deck, indent="\t", ensure_ascii=False) + "\n")
        n = len(deck["questions"])
        multi = sum(1 for q in deck["questions"] if len(q["tags"]) > 1)
        avg = sum(len(q["tags"]) for q in deck["questions"]) / n
        print(f"{filename}: {n} questions, {len(tag_list)} tags, avg {avg:.1f} tags/question, "
              f"{multi} with 2+ tags, untagged: {untagged or 'none'}")
        for t in tag_list:
            print(f"   {t['count']:4d}  {t['kind'][:4]}  {t['name']}")


if __name__ == "__main__":
    main()
