import Handlebars from "handlebars";
import prisma from "../utils/prisma.js";
import logger from "../utils/logger.js";

// In-memory cache for compiled templates
const templateCache = new Map();

export async function getCompiledTemplate(name) {
  if (templateCache.has(name)) {
    return templateCache.get(name);
  }

  const template = await prisma.template.findUnique({
    where: { name, isActive: true },
  });

  if (!template) {
    throw new Error(`Template "${name}" not found or inactive`);
  }

  const compiled = {
    raw: template,
    subjectFn: template.subject ? Handlebars.compile(template.subject) : null,
    bodyFn: Handlebars.compile(template.body),
  };

  templateCache.set(name, compiled);
  logger.debug(`Template "${name}" compiled and cached`);
  return compiled;
}

export async function renderTemplate(name, variables = {}) {
  const { subjectFn, bodyFn } = await getCompiledTemplate(name);

  return {
    subject: subjectFn ? subjectFn(variables) : null,
    body: bodyFn(variables),
  };
}

export function invalidateCache(name) {
  templateCache.delete(name);
  logger.info(`Template cache invalidated for: ${name}`);
}

export function resolveTemplateName(category, type) {
  return `${category.toLowerCase()}_${type.toLowerCase()}`;
}