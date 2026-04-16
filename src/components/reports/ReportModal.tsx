import React from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Modal,
} from 'react-native';
import { Text, IconButton, ActivityIndicator } from 'react-native-paper';
import { Button } from '../common';

export interface ReportColumn {
  key: string;
  label: string;
  width: number;
  align?: 'left' | 'center';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReportRow = any;

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  onExportPdf: () => void;
  title: string;
  dateRange: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  pdfLoading: boolean;
}

export default function ReportModal({
  visible,
  onClose,
  onExportPdf,
  title,
  dateRange,
  columns,
  rows,
  pdfLoading,
}: ReportModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="titleMedium" style={styles.title}>
              {title}
            </Text>
            <Text variant="bodySmall" style={styles.subtitle}>
              {dateRange}
            </Text>
          </View>
          <IconButton icon="close" size={24} onPress={onClose} />
        </View>

        {/* Table */}
        {rows.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text variant="bodyMedium" style={styles.emptyText}>
              No data found for the selected date range.
            </Text>
          </View>
        ) : (
          <ScrollView style={styles.tableScroll}>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                {/* Header row */}
                <View style={styles.headerRow}>
                  {columns.map((col) => (
                    <View key={col.key} style={[styles.cell, { width: col.width }]}>
                      <Text variant="labelSmall" style={styles.headerCell}>
                        {col.label}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Data rows */}
                {rows.map((row, index) => (
                  <View
                    key={index}
                    style={[styles.row, index % 2 === 0 && styles.evenRow]}
                  >
                    {columns.map((col) => (
                      <View key={col.key} style={[styles.cell, { width: col.width }]}>
                        <Text
                          variant="bodySmall"
                          style={[
                            styles.cellText,
                            col.align === 'left' && styles.leftAlignCell,
                          ]}
                          numberOfLines={1}
                        >
                          {String(row[col.key] ?? '')}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          </ScrollView>
        )}

        {/* Bottom bar */}
        <View style={styles.bottomBar}>
          <Button
            mode="outlined"
            onPress={onClose}
            style={styles.bottomButton}
          >
            Close
          </Button>
          <Button
            mode="contained"
            onPress={onExportPdf}
            disabled={pdfLoading || rows.length === 0}
            style={styles.bottomButton}
            icon={pdfLoading ? undefined : 'file-pdf-box'}
          >
            {pdfLoading ? 'Generating...' : 'Export PDF'}
          </Button>
        </View>
        {pdfLoading && (
          <ActivityIndicator size="small" style={styles.pdfLoading} />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontWeight: '600',
  },
  subtitle: {
    color: '#666',
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
  },
  tableScroll: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#1a73e8',
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  evenRow: {
    backgroundColor: '#f9f9f9',
  },
  cell: {
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  headerCell: {
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
  },
  cellText: {
    textAlign: 'center',
    color: '#333',
  },
  leftAlignCell: {
    textAlign: 'left',
    fontWeight: '500',
  },
  bottomBar: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  bottomButton: {
    flex: 1,
  },
  pdfLoading: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
  },
});
