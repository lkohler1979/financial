import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../src/app";

describe("GET /health", () => {
  it("retorna status ok", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "ethos-financial-api" });
  });
});
