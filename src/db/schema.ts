import {
  pgTable,
  text,
  integer,
  doublePrecision,
  jsonb,
  timestamp,
  serial,
} from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  priceInr: integer("price_inr").notNull(),
  fitNotes: text("fit_notes").notNull().default(""),
  sizeChart: jsonb("size_chart").notNull().default([]),
  qualityNotes: text("quality_notes").notNull().default(""),
});

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  region: text("region").notNull(),
  tenureDays: integer("tenure_days").notNull(),
  lifetimeOrders: integer("lifetime_orders").notNull().default(0),
  // Historical behavior at account level (per-customer rates are derived at query time)
  preferredLanguage: text("preferred_language").notNull().default("en"),
});

export const returnCases = pgTable("return_cases", {
  id: text("id").primaryKey(),
  customerId: text("customer_id"),
  productId: text("product_id"),
  skuCategory: text("sku_category").notNull().default(""),
  orderValue: doublePrecision("order_value").notNull(),
  quantity: integer("quantity").notNull().default(1),
  discountPct: doublePrecision("discount_pct").notNull().default(0),
  deliveryDays: integer("delivery_days").notNull().default(0),
  daysSinceDelivery: integer("days_since_delivery").notNull().default(0),
  paymentMethod: text("payment_method").notNull().default(""),
  region: text("region").notNull().default(""),
  customerTenureDays: integer("customer_tenure_days"),
  priorOrders12m: integer("prior_orders_12m"),
  priorReturns12m: integer("prior_returns_12m"),
  accountOrdersLifetime: integer("account_orders_lifetime"),
  historyMissing: integer("history_missing").notNull().default(0),
  reasonText: text("reason_text").notNull().default(""),
  detectedLanguage: text("detected_language").notNull().default("unknown"),
  // Ground truth: present for synthetic demo data, null for live/uploads
  label: text("label"),
  source: text("source").notNull().default("synthetic-demo"), // synthetic-demo | upload | live
  split: text("split").notNull().default("train"), // train | val | test | upload | live
  monthIndex: integer("month_index").notNull().default(0),
  // Persisted model outputs (never overwritten by human review actions)
  probs: jsonb("probs"),
  predictedClass: text("predicted_class"),
  routing: text("routing"),
  expectedCost: doublePrecision("expected_cost"),
  calibratedConfidence: doublePrecision("calibrated_confidence"),
  modelVersion: text("model_version"),
  reviewStatus: text("review_status").notNull().default("open"), // open | pending | decided
  createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
});

export const reviewActions = pgTable("review_actions", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull(),
  action: text("action").notNull(), // approve | override | pending | evidence-request | outcome
  actor: text("actor").notNull().default("demo-reviewer"),
  detail: text("detail").notNull().default(""),
  modelVersion: text("model_version"),
  originalRouting: text("original_routing"),
  createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
});

export const modelRuns = pgTable("model_runs", {
  id: serial("id").primaryKey(),
  version: text("version").notNull(),
  kind: text("kind").notNull(), // baseline | structured | text | fused
  dataSource: text("data_source").notNull().default("synthetic-demo"),
  metrics: jsonb("metrics").notNull(),
  createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
});

export const messageDrafts = pgTable("message_drafts", {
  id: serial("id").primaryKey(),
  caseId: text("case_id"),
  category: text("category").notNull(),
  language: text("language").notNull(),
  body: text("body").notNull(),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
});
