import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";

const app = new Hono();

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint - all analysis runs client-side
app.get("/make-server-f4878170/health", (c) => {
  return c.json({ status: "ok", mode: "client-side" });
});

// All other routes return a message directing to client-side processing
app.all("/make-server-f4878170/*", (c) => {
  return c.json({ 
    message: "MuleShield runs entirely client-side. No server endpoints needed.",
    status: "ok"
  });
});

Deno.serve(app.fetch);