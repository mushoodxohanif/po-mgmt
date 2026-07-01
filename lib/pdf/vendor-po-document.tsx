import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

export type VendorPoPdfLine = {
  partName: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  thumbnailUrl?: string | null;
};

export type VendorPoPdfData = {
  companyName: string;
  vendorPoId: number;
  versionNumber: number;
  createdAt: Date;
  vendor: {
    name: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  lines: VendorPoPdfLine[];
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  header: {
    marginBottom: 24,
  },
  companyName: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  metaBlock: {
    width: "48%",
  },
  label: {
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  text: {
    marginBottom: 2,
    color: "#333",
  },
  table: {
    marginTop: 8,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    paddingBottom: 4,
    marginBottom: 4,
    fontFamily: "Helvetica-Bold",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
  },
  colPart: { width: "17%" },
  colThumb: { width: "7%" },
  colDescription: { width: "31%" },
  colQty: { width: "11%", textAlign: "right" },
  colUnitPrice: { width: "17%", textAlign: "right" },
  colLineTotal: { width: "17%", textAlign: "right" },
  thumb: {
    width: 28,
    height: 28,
    objectFit: "cover" as const,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#000",
  },
  totalsLabel: {
    fontFamily: "Helvetica-Bold",
    marginRight: 12,
  },
  totalsValue: {
    fontFamily: "Helvetica-Bold",
    width: "17%",
    textAlign: "right",
  },
  footer: {
    marginTop: 16,
    fontSize: 9,
    color: "#666",
  },
});

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(date);
}

function formatMoney(amount: number): string {
  return `PKR ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

export function VendorPoDocument({ data }: { data: VendorPoPdfData }) {
  const totalQty = data.lines.reduce((sum, line) => sum + line.quantity, 0);
  const grandTotal = data.lines.reduce((sum, line) => sum + line.lineTotal, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.companyName}>{data.companyName}</Text>
          <Text style={styles.title}>Purchase Order</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Vendor</Text>
            <Text style={styles.text}>{data.vendor.name}</Text>
            {data.vendor.contactName ? (
              <Text style={styles.text}>Attn: {data.vendor.contactName}</Text>
            ) : null}
            {data.vendor.email ? (
              <Text style={styles.text}>{data.vendor.email}</Text>
            ) : null}
            {data.vendor.phone ? (
              <Text style={styles.text}>{data.vendor.phone}</Text>
            ) : null}
            {data.vendor.address ? (
              <Text style={styles.text}>{data.vendor.address}</Text>
            ) : null}
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>PO Number</Text>
            <Text style={styles.text}>#{data.vendorPoId}</Text>
            <Text style={styles.label}>Version</Text>
            <Text style={styles.text}>v{data.versionNumber}</Text>
            <Text style={styles.label}>Date</Text>
            <Text style={styles.text}>{formatDate(data.createdAt)}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colPart}>Part</Text>
            <Text style={styles.colThumb}> </Text>
            <Text style={styles.colDescription}>Description</Text>
            <Text style={styles.colQty}>Quantity</Text>
            <Text style={styles.colUnitPrice}>Unit price</Text>
            <Text style={styles.colLineTotal}>Line total</Text>
          </View>
          {data.lines.map((line) => (
            <View
              key={`${line.partName}-${line.description ?? ""}-${line.quantity}`}
              style={styles.tableRow}
            >
              <Text style={styles.colPart}>{line.partName}</Text>
              <View style={styles.colThumb}>
                {line.thumbnailUrl ? (
                  <Image src={line.thumbnailUrl} style={styles.thumb} />
                ) : null}
              </View>
              <Text style={styles.colDescription}>
                {line.description ?? "—"}
              </Text>
              <Text style={styles.colQty}>{line.quantity}</Text>
              <Text style={styles.colUnitPrice}>
                {formatMoney(line.unitPrice)}
              </Text>
              <Text style={styles.colLineTotal}>
                {formatMoney(line.lineTotal)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Grand total</Text>
          <Text style={styles.totalsValue}>{formatMoney(grandTotal)}</Text>
        </View>

        <View style={styles.footer}>
          <Text>
            Total lines: {data.lines.length} · Total quantity: {totalQty}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
