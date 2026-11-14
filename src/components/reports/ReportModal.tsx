import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Modal } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { Button, Tappable } from '../common';
import { colors, fontWeight, radius, spacing, typography } from '../../constants/theme';

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
            <Text variant={typography.h4} style={styles.title}>
              {title}
            </Text>
            <Text variant={typography.caption} style={styles.subtitle}>
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
            <Tappable
              style={[styles.chip, selectedStudent === null && styles.chipActive]}
              onPress={() => setSelectedStudent(null)}
            >
              <Text
                variant={typography.labelSmall}
                style={selectedStudent === null ? styles.chipTextActive : styles.chipText}
              >
                All Students
              </Text>
            </Tappable>
            {studentNames.map((name) => (
              <Tappable
                key={name}
                style={[styles.chip, selectedStudent === name && styles.chipActive]}
                onPress={() => setSelectedStudent(name)}
              >
                <Text
                  variant={typography.labelSmall}
                  style={selectedStudent === name ? styles.chipTextActive : styles.chipText}
                >
                  {name}
                </Text>
              </Tappable>
            ))}
          </ScrollView>
        )}

        {/* Table */}
        {displayedRows.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text variant={typography.body} style={styles.emptyText}>
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
                      <Text variant={typography.labelSmall} style={styles.headerCell}>
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
                          variant={typography.caption}
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
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 48,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontWeight: fontWeight.semibold,
  },
  subtitle: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  filterScroll: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexGrow: 0,
  },
  filterContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.text,
  },
  chipTextActive: {
    color: colors.onPrimary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  tableScroll: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  evenRow: {
    backgroundColor: colors.surface,
  },
  cell: {
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  headerCell: {
    color: colors.onPrimary,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  cellText: {
    textAlign: 'center',
    color: colors.text,
  },
  leftAlignCell: {
    textAlign: 'left',
    fontWeight: fontWeight.medium,
  },
  bottomBar: {
    flexDirection: 'row',
    padding: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bottomButton: {
    flex: 1,
  },
});
