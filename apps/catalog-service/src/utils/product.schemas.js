import { z } from 'zod';
import { Prisma } from '@prisma/client';

// --- SHARED REUSABLE SCHEMAS ---

const imageSchema = z.object({
  url: z.string().url(),
  isPrimary: z.boolean().default(false),
  altText: z.string().optional()
}).strict(); 

const variantSchema = z.object({
  sku: z.string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, "SKU can only contain letters, numbers, hyphens, and underscores")
    .transform(val => val.toUpperCase()), // Normalizes to uppercase early
  
  // 🚀 Financial Safety: Validates the string format, then immediately casts to Prisma.Decimal
  price: z.string()
    .regex(/^\d+(\.\d{1,2})?$/, "Price must be a valid format (e.g., '19.99')")
    .transform(val => new Prisma.Decimal(val)),
  
  attributes: z.record(z.string()).default({}) 
}).strict();

// --- ROUTE-SPECIFIC SCHEMAS ---

export const createProductSchema = z.object({
  body: z.object({
    categoryId: z.string().uuid("Invalid Category ID format"),
    name: z.string().min(3).max(255),
    description: z.string().min(10),
    
    images: z.array(imageSchema)
      .min(1, "At least one image is required")
      .superRefine((images, ctx) => {
        const primaryCount = images.filter(i => i.isPrimary).length;
        if (primaryCount === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "One image must be marked as primary" });
        }
        if (primaryCount > 1) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Only one image can be primary" });
        }
      }),

    // 🚀 Uniqueness Guard: Prevents duplicate SKUs in the exact same payload
    variants: z.array(variantSchema)
      .min(1, "At least one variant (SKU) is required")
      .superRefine((variants, ctx) => {
        const skus = variants.map(v => v.sku);
        const duplicates = skus.filter((sku, index) => skus.indexOf(sku) !== index);
        
        if (duplicates.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate SKU(s) in payload: ${[...new Set(duplicates)].join(', ')}`
          });
        }
      })
  }).strict(), 
  
  params: z.object({}).strict(),
  query: z.object({}).strict()
});

export const changeStatusSchema = z.object({
  body: z.object({
    status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']),
    expectedVersion: z.number().int().positive()
  }).strict(),
  
  params: z.object({
    id: z.string().uuid("Invalid Product ID")
  }).strict(),
  
  query: z.object({}).strict()
});

export const getProductSchema = z.object({
  body: z.object({}).strict(),
  params: z.object({
    id: z.string().uuid("Invalid Product ID")
  }).strict(),
  query: z.object({}).strict() 
});