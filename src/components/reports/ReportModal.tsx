import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { Text, IconButton } from 'react-native-paper';
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
  onExportPdf: (filteredRows: ReportRow[]) => void;
  title: string;
  dateRange: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  pdfLoading: boolean;
}

function getStudentName(row: ReportRow): string {
  return row.student ?? row.studentName ?? '';
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
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  // Reset filter when a new report is opened
  useEffect(() => {
    setSelectedStudent(null);
  }, [rows]);

  const studentNames: string[] = Array.from(
    new Set(rows.map(getStudentName).filter(Boolean))
  ).sort() as string[];

  const showFilter = studentNames.length > 1;

  const displayedRows = selectedStudent
    ? rows.filter((r) => getStudentName(r) === selectedStudent)
    : rows;

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

        {/* Student filter */}
        {showFilter && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.filterContent}
          >
            <TouchableOpacity
              style={[styles.chip, selectedStudent === null && styles.chipActive]}
              onPress={() => setSelectedStudent(null)}
            >
              <Text
                variant="labelSmall"
                style={selectedStudent === null ? styles.chipTextActive : styles.chipText}
              >
                All Students
              </Text>
            </TouchableOpacity>
            {studentNames.map((name) => (
              <TouchableOpacity
                key={name}
                style={[styles.chip, selectedStudent === name && styles.chipActive]}
                onPress={() => setSelectedStudent(name)}
              >
                <Text
                  variant="labelSmall"
                  style={selectedStudent === name ? styles.chipTextActive : styles.chipText}
                >
                  {name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Table */}
        {displayedRows.length === 0 ? (
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
                {displayedRows.map((row, index) => (
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
            onPress={() => onExportPdf(displayedRows)}
            disabled={pdfLoading || displayedRows.length === 0}
            loading={pdfLoading}
            style={styles.bottomButton}
            icon={pdfLoading ? undefined : 'file-pdf-box'}
          >
            {pdfLoading ? 'Generating...' : 'Export PDF'}
          </Button>
        </View>
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
  filterScroll: {
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    flexGrow: 0,
  },
  filterContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#c0c0c0',
    backgroundColor: '#fff',
  },
  chipActive: {
    backgroundColor: '#1a73e8',
    borderColor: '#1a73e8',
  },
  chipText: {
    color: '#444',
  },
  chipTextActive: {
    color: '#fff',
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
});
