# CodeStable

CodeStable defines and distributes reusable AI-agent skills. This context records the product vocabulary used to distinguish its publishable skills from host-specific packaging.

## Language

**Canonical Skill**:
A user-facing CodeStable skill retained in the product, including the Onboarding Skill. Host plugin adapters and legacy compatibility variants are not Canonical Skills.
_Avoid_: plugin skill, compatibility skill

**Core Skill Set**:
The complete set of current user-facing `cs-*` skills retained as Canonical Skills.
_Avoid_: selected skills, partial skill set

**Minimal README**:
The sole retained root-level product document, limited to the project's purpose, skill list, and `npx skills` installation instructions.
_Avoid_: documentation suite, workflow guide

**Skill-Only Repository**:
A repository containing only the Minimal README and Canonical Skills with resources owned by those skills. Standalone tests, experiments, tools, assets, and historical project artifacts are excluded.
_Avoid_: plugin repository, development repository

**Deprecated Compatibility Entry**:
A legacy skill name that only redirects an old invocation to a Canonical Skill. Deprecated Compatibility Entries are not retained in the product.
_Avoid_: compatibility skill, alias skill

**Maintenance Skill**:
A skill used to author or evaluate CodeStable skills rather than to serve end users. Maintenance Skills are not retained in the product.
_Avoid_: development skill, internal skill

**Onboarding Skill**:
A Canonical Skill that establishes CodeStable's required project structure in a target repository. It remains part of the product.
_Avoid_: setup script, project template
