# Enterprise Relationship Graph System

## Mission

Build a world-class enterprise relationship intelligence platform.

This is NOT a CRUD admin dashboard.

The product should feel like:

* Palantir Foundry
* Bloomberg Terminal
* PitchBook
* Linkurious
* Neo4j Bloom
* Apple Vision Pro level polish

Every screen must communicate:

* authority
* trust
* intelligence
* professionalism

Users are:

* bank regulators
* financial investigators
* auditors
* compliance officers
* risk managers

---

# Design Principles

## 1. Information First

Data is the product.

Never sacrifice readability for decoration.

Visual hierarchy must clearly answer:

1. What am I looking at?
2. What is important?
3. What requires action?

---

## 2. Dark Mode Default

The platform is dark-first.

Preferred palette:

Background:
#0A0E14

Secondary Surface:
#111827

Card Surface:
#151D2B

Border:
rgba(255,255,255,0.06)

Primary Text:
#F9FAFB

Secondary Text:
#9CA3AF

Accent:
#3B82F6

Success:
#10B981

Warning:
#F59E0B

Danger:
#EF4444

---

## 3. Premium Density

Avoid oversized spacing.

Target:

Bloomberg Terminal density

not

Notion density

Large datasets should remain visible.

Users should not need excessive scrolling.

---

# Relationship Graph Requirements

## Core Experience

Graph is the primary object.

Everything else supports the graph.

Layout:

Left Panel:
Search + Filters

Center:
Graph Canvas

Right Panel:
Node Details

Bottom:
Timeline / Event Stream

---

## Graph Interaction

Support:

* zoom
* pan
* minimap
* focus mode
* path analysis
* neighborhood expansion

Animations:

200-300ms maximum

No flashy effects.

Motion should feel deliberate.

---

## Node Design

### Enterprise

Shape:
Rounded Rectangle

Fields:

* company name
* unified credit code
* risk level

Visual Weight:
Highest

---

### Actual Controller

Shape:
Circle

Color:
Purple family

---

### Shareholder

Shape:
Hexagon

Color:
Blue family

---

### Legal Representative

Shape:
Diamond

Color:
Green family

---

### Group Company

Shape:
Large Rounded Rectangle

Border:
Glow effect

Highest prominence.

---

# Edge Design

Relationship direction must be visible.

Use:

Arrow Heads

Supported Types:

* shareholding
* investment
* guarantee
* control
* management
* affiliate

Edge Labels:

Always readable.

Avoid overlap.

---

# Risk Visualization

Risk information should never rely only on color.

Use:

* color
* icon
* badge
* label

Example:

High Risk:
🔴 HIGH

Medium Risk:
🟡 MEDIUM

Low Risk:
🟢 LOW

---

# Data Tables

Tables must feel professional.

Requirements:

* sticky header
* column resize
* sorting
* filtering
* export

Preferred:

AG Grid Enterprise

or

TanStack Table

Never use simplistic HTML tables.

---

# Typography

Font Stack:

Inter,
SF Pro Display,
PingFang SC,
sans-serif

Hierarchy:

Page Title:
32px

Section Title:
20px

Card Title:
16px

Body:
14px

Metadata:
12px

---

# Cards

Cards should feel premium.

Requirements:

* subtle blur
* soft shadows
* 12-16px radius
* translucent surfaces

Avoid:

material-ui default appearance

ant-design default appearance

bootstrap appearance

---

# Charts

Preferred:

* ECharts
* VisX

Avoid:

default chart themes

Every chart must be custom themed.

---

# Relationship Graph Tech Stack

Preferred:

React
TypeScript
Vite

Graph Engine:

Cytoscape.js

Alternative:

React Flow

For very large graphs:

Sigma.js

Backend:

Node.js

or

Python FastAPI

Graph Database:

Neo4j

Preferred Query:

Cypher

---

# AI Assistance

AI should help users:

* identify group customers
* identify actual controllers
* detect concerted action persons
* identify circular shareholding
* identify hidden control chains
* identify guarantee chains

Outputs should be explainable.

Every conclusion must show evidence path.

---

# Interaction Quality

Every interaction should feel:

* smooth
* intentional
* professional

Never generate generic admin dashboards.

Never generate toy-like visualizations.

Always optimize for executive-level software quality.

If a design decision is unclear:

Choose the option that would be selected by a senior product designer from Palantir or Bloomberg.