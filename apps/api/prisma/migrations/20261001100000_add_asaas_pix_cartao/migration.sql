-- AlterTable
ALTER TABLE "parcelas" ADD COLUMN     "asaas_billing_type" TEXT,
ADD COLUMN     "asaas_invoice_url" TEXT,
ADD COLUMN     "asaas_pix_copia_e_cola" TEXT,
ADD COLUMN     "asaas_pix_qrcode_expiracao" TIMESTAMP(3),
ADD COLUMN     "asaas_pix_qrcode_imagem" TEXT;
